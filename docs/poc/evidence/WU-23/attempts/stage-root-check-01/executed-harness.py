import json,hashlib,subprocess,os
root='docs/poc/evidence/WU-23/attempts/stage-root-check-01'
proof=json.load(open('docs/poc/evidence/WU-23/attempts/index-04/report.json'))
allowed={'docs/poc/PROGRESS.md','docs/poc/VISUAL_PARITY.md'}
changed=[]
for p,r in proof['files'].items():
 h=hashlib.sha256(open(p,'rb').read()).hexdigest()
 if h!=r['sha256']:changed.append(p)
assert set(changed)==allowed,changed
names=set(filter(None,subprocess.check_output(['git','diff','--cached','--name-only','-z']).decode().split('\0')))
assert names-set(proof['files'])=={'docs/poc/evidence/WU-23/root-pass.json'}|{'docs/poc/evidence/WU-23/attempts/index-04/'+p for p in ['executed-harness.py','report.json','cached-check.stdout.log','cached-check.stderr.log']}
cat=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
index=subprocess.Popen(['git','ls-files','--stage','-z'],stdout=subprocess.PIPE)
record=b'';verified=0;sizeTotal=0
try:
 while True:
  chunk=index.stdout.read(65536)
  if not chunk:break
  record+=chunk;rows=record.split(b'\0');record=rows.pop()
  for row in rows:
   meta,p=row.split(b'\t',1);p=p.decode()
   if p not in names:continue
   mode,oid,stage=meta.split();assert stage==b'0'
   cat.stdin.write(oid+b'\n');cat.stdin.flush();header=cat.stdout.readline().split();assert header[1]==b'blob';size=int(header[2]);h=hashlib.sha256();remaining=size
   while remaining:
    data=cat.stdout.read(min(65536,remaining));assert data;h.update(data);remaining-=len(data)
   assert cat.stdout.read(1)==b'\n'
   assert h.hexdigest()==hashlib.sha256(open(p,'rb').read()).hexdigest(),p
   verified+=1;sizeTotal+=size
 assert index.wait()==0;assert verified==len(names)
finally:cat.stdin.close();cat.wait()
check=subprocess.run(['git','diff','--cached','--check'],capture_output=True)
open(root+'/stdout.log','wb').write(check.stdout);open(root+'/stderr.log','wb').write(check.stderr)
assert check.returncode==0 and not check.stdout and not check.stderr
assert not subprocess.check_output(['git','diff','--name-only']).strip()
report={'status':'passed','protectedCandidateIndex':'cd32fe399e18f912b2f0dbe399ffcfa7792e870e51adb99e5fac8be5fee59606','metadataChangedOnly':changed,'productionChanges':0,'verifiedStagedBlobs':verified,'verifiedBytes':sizeTotal,'cachedCheckExit':check.returncode,'cachedCheckBytes':0,'selfEmittedAuditExcluded':True,'source86AndPorts':'cleanup01 and root independent check; no later source/server changes'}
open(root+'/report.json','w').write(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
