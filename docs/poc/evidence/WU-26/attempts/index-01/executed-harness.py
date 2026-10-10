import hashlib,json,os,subprocess,sys
attempt=sys.argv[1];root='docs/poc/evidence/WU-26/attempts/'+attempt
if os.path.exists(root):raise RuntimeError('Unique immutable index attempt required')
os.makedirs(root);source='tests/visual/auth/index-audit.py';open(root+'/executed-harness.py','wb').write(open(source,'rb').read())
names=subprocess.check_output(['git','diff','--cached','--name-only','-z']).decode().split('\0');changed=set(filter(None,names))
active=['package.json','eslint.config.mjs','docs/poc/PROGRESS.md','docs/poc/VISUAL_PARITY.md','.gitattributes','tests/data/http-bundle.mjs','apps/web/src/data/auth-demo.ts','apps/web/src/data/runtime.ts','apps/web/src/data/adapters/mock-entry.ts','apps/web/src/data/adapters/http-entry.ts','apps/web/tests/data/auth-demo.test.ts']
allowed=lambda p:p.startswith(('docs/poc/evidence/WU-26/','tests/visual/auth/','apps/web/src/features/auth/','apps/web/src/routes/login.tsx','apps/web/src/routes/signup.tsx','apps/web/src/routes/forgot-password.tsx','apps/web/src/routes/reset-password.tsx','apps/web/src/routes/verify-email.tsx','apps/web/src/routes/onboarding.tsx')) or p in active
assert all(allowed(p) for p in changed),'Only WU26 owned paths may be staged'
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
 owned='docs/poc/evidence/WU-26/'
 excluded_prefixes=[root+'/',owned+'raw/'+attempt+'/']
 physical=[os.path.join(directory,file) for directory,_,files in os.walk(owned) for file in files]
 unstaged=[p for p in physical if p not in changed]
 assert all(any(p.startswith(prefix) for prefix in excluded_prefixes) for p in unstaged),unstaged
 report['physicalEvidenceFiles']=len(physical)
 report['physicalEvidenceStaged']=len(physical)-len(unstaged)
 report['newlyEmittedExcludedPaths']=sorted(unstaged)
 report['postEmitExclusionScope']='Only this newly emitted audit directory and its running raw wrapper; separately stage and compare exact staged bytes after completion. No self-growing wrapper freeze or recursive self-index.'
 check=subprocess.run(['git','diff','--cached','--check'],capture_output=True);open(root+'/cached-check.stdout.log','wb').write(check.stdout);open(root+'/cached-check.stderr.log','wb').write(check.stderr);report['cachedWhitespaceStdoutSha256']=hashlib.sha256(check.stdout).hexdigest();report['cachedWhitespaceStderrSha256']=hashlib.sha256(check.stderr).hexdigest();report['cachedWhitespaceExit']=check.returncode;report['cachedWhitespaceBytes']=len(check.stdout)+len(check.stderr);assert check.returncode==0 and report['cachedWhitespaceBytes']==0
 report['status']='passed'
except BaseException as error:
 report['status']='failed';report['error']=str(error);raise
finally:
 cat.stdin.close();cat.wait();open(root+'/report.json','w').write(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='files'}))
