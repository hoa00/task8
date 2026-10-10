"""Stage WU26 only after the root's explicit reversible-staging authorization.

Raw command/stdout/stderr/status bytes live outside the index to avoid a
recursive staging log. Closed earlier records can be copied into evidence.
"""
import hashlib,json,os,shlex,subprocess,sys
attempt=sys.argv[1];root='/tmp/task8-wu26-'+attempt
assert not os.path.exists(root);os.makedirs(root)
open(root+'/executed-harness.py','xb').write(open(__file__,'rb').read())
records=[]
def run(name,args):
 command=(shlex.join(args)+'\n').encode();result=subprocess.run(args,capture_output=True)
 row={'id':name,'argv':args,'exitStatus':result.returncode}
 for key,data in [('command',command),('stdout',result.stdout),('stderr',result.stderr)]:
  path=root+'/'+name+'.'+key;open(path,'xb').write(data);row[key]={'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 records.append(row);open(root+'/commands.json','w').write(json.dumps(records,indent=2)+'\n')
 return result
active=['package.json','eslint.config.mjs','docs/poc/PROGRESS.md','docs/poc/VISUAL_PARITY.md','.gitattributes','tests/data/http-bundle.mjs','apps/web/src/data/auth-demo.ts','apps/web/src/data/runtime.ts','apps/web/src/data/adapters/mock-entry.ts','apps/web/src/data/adapters/http-entry.ts','apps/web/tests/data/auth-demo.test.ts','apps/web/src/features/auth','tests/visual/auth']
active += ['apps/web/src/routes/'+name+'.tsx' for name in ['login','signup','forgot-password','reset-password','verify-email','onboarding']]
paths=['docs/poc/PROGRESS.md','docs/poc/evidence/WU-26/root-pass.json'] if '--metadata' in sys.argv else active
assert run('add-owned',['git','add','--',*paths]).returncode==0
if '--metadata' not in sys.argv:assert run('force-owned-evidence',['git','add','-f','--','docs/poc/evidence/WU-26']).returncode==0
check=run('cached-whitespace',['git','diff','--cached','--check'])
report={'status':'passed' if check.returncode==0 else 'failed','commands':records,'scope':'Exact finite Git bytes outside the index; WU26 owned paths only. No Source reference or unrelated path added.'}
open(root+'/report.json','w').write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':report['status'],'cachedWhitespaceExit':check.returncode,'cachedWhitespaceBytes':len(check.stdout)+len(check.stderr),'proof':root+'/report.json'}))
sys.exit(0 if check.returncode==0 else 1)
