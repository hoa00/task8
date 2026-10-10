import hashlib,json,os,subprocess,sys
root='docs/poc/evidence/WU-26/attempts/'+sys.argv[1]
if os.path.exists(root):raise RuntimeError('Unique cleanup attempt required')
os.makedirs(root)
open(root+'/executed-harness.py','wb').write(open('tests/visual/auth/cleanup.py','rb').read())
report={'status':'running','commands':[]}
def run(name,args):
 result=subprocess.run(args,capture_output=True)
 files={}
 for side,data in [('stdout',result.stdout),('stderr',result.stderr)]:
  path=root+'/'+name+'.'+side;open(path,'xb').write(data);files[side]={'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 report['commands'].append({'id':name,'command':args,'exitStatus':result.returncode,**files})
 open(root+'/report.json','w').write(json.dumps(report,indent=2)+'\n')
 assert result.returncode==0,name
 return result.stdout.decode().strip()
try:
 report['origin']=run('origin',['git','remote','get-url','origin']);assert report['origin']=='https://github.com/hoa00/task8.git'
 run('fetch',['git','fetch','origin','main'])
 report['head']=run('head',['git','rev-parse','HEAD']);report['tree']=run('tree',['git','rev-parse','HEAD^{tree}']);report['originMain']=run('origin-main',['git','rev-parse','origin/main']);report['freshRemoteMain']=run('remote-main',['git','ls-remote','origin','refs/heads/main']).split()[0]
 assert report['head']==report['originMain']==report['freshRemoteMain']=='ae52fbb9c27a51745767dbddefed037c911f4972'
 report['divergence']=run('divergence',['git','rev-list','--left-right','--count','HEAD...origin/main']);assert report['divergence']=='0\t0'
 report['sourceHead']=run('source-head',['git','-C','.reference/gr8r-studio','rev-parse','HEAD']);report['sourceTree']=run('source-tree',['git','-C','.reference/gr8r-studio','rev-parse','HEAD^{tree}']);report['sourceStatus']=run('source-status',['git','-C','.reference/gr8r-studio','status','--porcelain']);report['sourceTracked']=len(run('source-tracked',['git','-C','.reference/gr8r-studio','ls-files']).splitlines());assert report['sourceHead']=='904205c626918ee96054eb35495c394a60c0c601' and report['sourceTree']=='5db5f992886b2345881946cf85fac098307953a5' and report['sourceStatus']=='' and report['sourceTracked']==86
 report['listeners']=run('ports',['ss','-ltnH','sport = :4173 or sport = :5173 or sport = :8787']);assert report['listeners']==''
 locks={'baseline-manifest.json':'b3ef541f9fa01c6c57d7344f9ca8efbc4acf5b35015f3ee7cf5df24dd4359bfe','font-assets.json':'af3c07090ede6a21872004ca20bb245ffd45dae46d01c6ebd6e96c1048e4bce4','source-fixture.json':'8e552aa66ea24cd6300c16242769a85548b315b1ca55258d03df76f8bf439a80','source-lock.json':'11d6a021b67d43c4c0685c0853492a06c3a18347a43844a08760ad9edc3a405d'}
 report['lockedInputs']={}
 for name,expected in locks.items():
  path='docs/poc/reference/'+name
  digest=hashlib.sha256(open(path,'rb').read()).hexdigest();assert digest==expected;report['lockedInputs'][name]={'path':path,'sha256':digest}
 report['runtime']=json.load(open('docs/poc/evidence/WU-26/runtime-119.json'));assert report['runtime']['observations_current'] and report['runtime']['network_policy']=={'mode':'unrestricted','state':'enforced'}
 report['status']='passed'
except BaseException as error:
 report['status']='failed';report['error']=str(error);raise
finally:open(root+'/report.json','w').write(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['commands','lockedInputs','runtime']}))
