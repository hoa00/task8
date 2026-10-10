import subprocess,json,hashlib
root='docs/poc/evidence/WU-23/attempts/lint-owned-01'
with open(root+'/lint.log','xb') as f:r=subprocess.run(['pnpm','exec','eslint','tests/visual/settings'],stdout=f,stderr=f)
open(root+'/report.json','w').write(json.dumps({'status':'passed' if r.returncode==0 else 'failed','command':['pnpm','exec','eslint','tests/visual/settings'],'exitStatus':r.returncode,'logSha256':hashlib.sha256(open(root+'/lint.log','rb').read()).hexdigest()},indent=2)+'\n')
print(json.dumps({'exitStatus':r.returncode}));raise SystemExit(r.returncode)
