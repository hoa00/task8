from pathlib import Path
import json,re,hashlib,subprocess,gzip
r=Path('/workspace/task8');e=r/'docs/engineering/evidence/AUTH-06/acceptance'
paths=['docs/engineering/ICT24H_AUTH_RUNBOOK.md','docs/engineering/ICT24H_AUTH_INTEGRATION_PLAN.md','docs/engineering/ICT24H_AUTH_SETUP.md','apps/api/README.md','docs/poc/BACKEND_SCOPE.md','docs/poc/DATA_MODEL.md','docs/poc/API_CONTRACT.md'];links=0
for name in paths:
 p=r/name
 for url in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if '://' in url or url.startswith('#'):continue
  dest=(p.parent/url.split('#')[0]).resolve();links+=1
  assert dest.exists(),(name,url)
manifest=json.loads((r/'docs/engineering/reference/ict24h/source-manifest.json').read_text())
assert hashlib.sha256((r/'docs/engineering/reference/ict24h/identity-service.md').read_bytes()).hexdigest()==manifest['identityService']['sha256']
assert manifest['identityService']['deploymentRevisionVerified'] is False
assert manifest['library']['packageOrTarballVerified'] and manifest['library']['workerRuntimeVerified']
assert manifest['liveAcceptance']['status']=='LOCAL_VERIFIED_LIVE_PENDING'
for key in ['packageEvidence','workerEvidence']:assert (r/'docs/engineering/reference/ict24h'/manifest['library'][key]).resolve().exists()
verification=json.loads((e/'verification.json').read_text())
for link in [verification['runbook'],verification['inputs'],verification['visual']['reference']]:assert (e/link).resolve().exists()
for p in e.glob('*.json'):json.loads(p.read_text())
for p in e.glob('*.json.gz'):json.loads(gzip.decompress(p.read_bytes()))
for name in ['docs/poc/evidence/WU-06/http-bundle.json','docs/poc/evidence/WU-06/http-module-graph.json']:
 assert (r/name).read_bytes()==subprocess.check_output(['git','show','b56c5f0d:'+name],cwd=r)
for p in e.glob('*.json'):
 d=json.loads(p.read_text())
 if isinstance(d,dict) and 'log' in d:assert hashlib.sha256(gzip.decompress((e/d['log']).read_bytes())).hexdigest()==d['sha256']
print(json.dumps({'status':'PASS','localDocLinks':links,'referenceSnapshotHashPreserved':True,'liveDeploymentNotClaimed':True,'historicalHttpBundleReportsBytePreserved':True,'gateLogHashVerification':True}))
