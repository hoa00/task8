import subprocess,json,hashlib,os
root='docs/poc/evidence/WU-23/attempts/lint-01'
with open(root+'/lint.log','xb') as f:r=subprocess.run(['pnpm','lint'],stdout=f,stderr=f)
report={'status':'passed' if r.returncode==0 else 'failed','command':['pnpm','lint'],'exitStatus':r.returncode,'logSha256':hashlib.sha256(open(root+'/lint.log','rb').read()).hexdigest(),'runtime':{'node':subprocess.check_output(['node','--version']).decode().strip(),'directories':{k:os.environ.get(k) for k in ['XDG_DATA_HOME','XDG_CACHE_HOME','XDG_CONFIG_HOME','PNPM_CONFIG_STORE_DIR','WRANGLER_LOG_PATH']}}}
open(root+'/report.json','w').write(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
raise SystemExit(r.returncode)
