import hashlib,json,os,subprocess,sys
attempt=sys.argv[1];root='docs/poc/evidence/WU-23/attempts/'+attempt
if os.path.exists(root):raise RuntimeError('Unique immutable index attempt required')
os.makedirs(root);source='tests/visual/settings/index-audit.py';open(root+'/executed-harness.py','wb').write(open(source,'rb').read())
names=subprocess.check_output(['git','diff','--cached','--name-only','-z']).decode().split('\0');changed=set(filter(None,names))
allowed=lambda p:p.startswith(('apps/web/src/','apps/web/tests/data/settings.test.ts','docs/poc/evidence/WU-23/','tests/visual/settings/')) or p in ['packages/contracts/src/models.ts','packages/ui/src/styles/theme.css','packages/ui/src/styles/overlays.css','docs/poc/DECISIONS.md','.gitattributes','docs/poc/PROGRESS.md','docs/poc/VISUAL_PARITY.md','package.json','eslint.config.mjs','tests/data/http-bundle.mjs']
assert all(allowed(p) for p in changed),'Only own WU22 files may be staged'
report={'status':'running','scope':'Streaming git cat-file --batch staged own blobs versus actual worktree bytes; all generated/frozen assets preserved. Does not include the newly emitted audit result itself.','stagedChangedCount':len(changed),'verified':0,'bytes':0,'files':{}}
cat=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
index=subprocess.Popen(['git','ls-files','--stage','-z'],stdout=subprocess.PIPE)
record=b''
try:
 while True:
  chunk=index.stdout.read(65536)
  if not chunk:break
  record+=chunk
  rows=record.split(b'\0');record=rows.pop()
  for row in rows:
   meta,p=row.split(b'\t',1);p=p.decode();mode,oid,stage=meta.split()
   if p not in changed:continue
   assert stage==b'0'
   cat.stdin.write(oid+b'\n');cat.stdin.flush();header=cat.stdout.readline().split();assert header[1]==b'blob';size=int(header[2]);digest=hashlib.sha256();remaining=size
   while remaining:
    data=cat.stdout.read(min(65536,remaining));assert data;digest.update(data);remaining-=len(data)
   assert cat.stdout.read(1)==b'\n';work=hashlib.sha256()
   with open(p,'rb') as f:
    for data in iter(lambda:f.read(65536),b''):work.update(data)
   assert digest.digest()==work.digest(),p
   report['files'][p]={'sha256':digest.hexdigest(),'gitBlob':oid.decode(),'bytes':size};report['verified']+=1;report['bytes']+=size
 assert index.wait()==0
 assert report['verified']==len(changed)
 check=subprocess.run(['git','diff','--cached','--check'],capture_output=True);report['cachedWhitespaceExit']=check.returncode;report['cachedWhitespaceBytes']=len(check.stdout)+len(check.stderr);assert check.returncode==0 and report['cachedWhitespaceBytes']==0
 report['status']='passed'
except BaseException as error:
 report['status']='failed';report['error']=str(error);raise
finally:
 cat.stdin.close();cat.wait();open(root+'/report.json','w').write(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='files'}))
