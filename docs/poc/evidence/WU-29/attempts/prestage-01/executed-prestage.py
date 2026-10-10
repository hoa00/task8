"""Finite selected-index/raw/Git preflight, with all returned bytes persisted first."""
import hashlib
import json
import pathlib
import shlex
import socket
import subprocess
import sys

ROOT = pathlib.Path('.')
OUT = pathlib.Path('docs/poc/evidence/WU-29/attempts') / sys.argv[1]
OUT.mkdir()
(OUT/'executed-prestage.py').write_bytes(pathlib.Path(__file__).read_bytes())
cache = {}
def ref(path):
    path=pathlib.Path(path)
    if str(path) not in cache:
        data=path.read_bytes();cache[str(path)]=dict(path=str(path),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
    return cache[str(path)]
commands=[]
def run(name,argv):
    command=OUT/(name+'.command.txt');command.write_text(shlex.join(argv)+'\n')
    stdout=OUT/(name+'.stdout');stderr=OUT/(name+'.stderr')
    with stdout.open('wb') as out,stderr.open('wb') as err: result=subprocess.run(argv,stdout=out,stderr=err,check=False)
    execution=dict(argv=argv,command=ref(command),stdout=ref(stdout),stderr=ref(stderr),exitStatus=result.returncode)
    receipt=OUT/(name+'.execution.json');receipt.write_text(json.dumps(execution,indent=2)+'\n');commands.append(dict(execution=ref(receipt),result=execution))
    assert result.returncode==0,execution
    assert shlex.split(command.read_text())==argv
    return stdout.read_bytes()
head=run('head',['git','rev-parse','HEAD']).decode().strip();assert head=='02aa94a965e1cc71a34d209517017b48c1d8cc96'
branch=run('branch',['git','branch','--show-current']).decode().strip();assert branch=='work'
origin=run('origin',['git','remote','get-url','origin']).decode().strip();assert origin=='https://github.com/hoa00/task8.git'
run('fetch',['git','fetch','origin','main'])
remote=run('remote',['git','ls-remote','origin','refs/heads/main']).decode().split()[0];assert remote==head
divergence=run('divergence',['git','rev-list','--left-right','--count','HEAD...origin/main']).decode().split();assert divergence==['0','0']
staged=run('staged',['git','diff','--cached','--name-only','-z']);assert not staged
modified=run('modified',['git','diff','--name-only','-z']).decode().split('\0');modified=[p for p in modified if p]
allowed={'docs/poc/PROGRESS.md','eslint.config.mjs','package.json','tests/data/http-bundle.mjs'}
assert all(p.startswith('apps/web/src/') or p in allowed for p in modified),modified
run('active-whitespace',['git','diff','--check','--',*modified])
sourceHead=run('source-head',['git','-C','.reference/gr8r-studio','rev-parse','HEAD']).decode().strip();assert sourceHead=='904205c626918ee96054eb35495c394a60c0c601'
sourceStatus=run('source-status',['git','-C','.reference/gr8r-studio','status','--porcelain','--untracked-files=no']);assert not sourceStatus
tracked=run('source-tracked',['git','-C','.reference/gr8r-studio','ls-files','-z']).decode().split('\0');assert len([p for p in tracked if p])==86
locks=[ref(pathlib.Path('docs/poc/reference')/name) for name in ['baseline-manifest.json','font-assets.json','source-fixture.json','source-lock.json']]
ports=[]
for port in [4173,5173,5174,8787]:
    with socket.socket() as sock:
        code=sock.connect_ex(('127.0.0.1',port));ports.append(dict(port=port,connectResult=code));assert code!=0,port
checks={}
def walk(value):
    if isinstance(value,dict):
        if isinstance(value.get('path'),str) and isinstance(value.get('sha256'),str):
            actual=ref(value['path']);assert actual['sha256']==value['sha256'],value
            if isinstance(value.get('bytes'),int):assert actual['bytes']==value['bytes'],value
            checks[actual['path']]=actual
        for item in value.values():walk(item)
    elif isinstance(value,list):
        for item in value:walk(item)
indices=[]
for name in ['INVENTORY_INDEX.json','NATIVE_INDEX.json','ACTION_INDEX.json','REUSE_INDEX.json']:
    path=pathlib.Path('docs/poc/evidence/WU-29/indices/index-04')/name;walk(json.loads(path.read_text()));indices.append(ref(path))
raw=[]
for path in sorted(pathlib.Path('docs/poc/evidence/WU-29/raw').glob('*/execution.json')):
    record=json.loads(path.read_text());walk(record)
    assert shlex.split(pathlib.Path(record['command']['path']).read_text())==record['argv'],path
    raw.append(dict(execution=ref(path),exitStatus=record['exitStatus'],signal=record.get('signal'),error=record.get('error')))
report=dict(status='passed-selected-index-raw-and-prestage',head=head,branch=branch,origin=origin,remote=remote,divergence=divergence,stagedEmpty=True,commands=commands,source=dict(head=sourceHead,tracked=86,clean=True,locks=locks),ports=ports,indices=indices,referencedFiles=list(checks.values()),raw=raw,modified=modified,qualification='Finite pre-stage read-only checks. Stage/technical acceptance are still pending. Historical failed reports and absent historical originals remain qualified; selected report-byte checks do not invent a browser rerun or Root physical capture.')
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(attempt=sys.argv[1],referencedFiles=len(checks),rawExecutions=len(raw),modified=len(modified))))
