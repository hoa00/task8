import hashlib,json,os,re,sys
attempt=sys.argv[1];root='docs/poc/evidence/WU-28';output=root+'/attempts/'+attempt
assert not os.path.exists(output);os.makedirs(output)
open(output+'/executed-harness.py','wb').write(open(__file__,'rb').read())
files=[]
for directory,_,names in os.walk(root):
 for name in names:
  path=directory+'/'+name
  if path.startswith(output+'/') or path.startswith(root+'/raw/'+attempt+'/'):continue
  data=open(path,'rb').read()
  if b'\0' in data:continue
  kinds=[]
  if re.search(rb'[ \t]+\r?$',data,re.M):kinds.append('blank-at-eol')
  if re.search(rb'\n(?:[ \t]*\r?\n)+\Z',data):kinds.append('blank-at-eof')
  if re.search(rb'^ +\t',data,re.M):kinds.append('space-before-tab')
  if not kinds:continue
  assert '/archives/' in path or path.endswith(('.stdout','.stderr','/stdout','/stderr','.log')),path
  files.append({'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'errors':kinds,'literalAttribute':path+' -whitespace'})
report={'status':'proposal-only','scope':'Exact literal owned archival/generated-log paths only; preserves bytes, no wildcard or active-code waiver. No .gitattributes write/staging authorized yet. Running wrapper/audit output excluded explicitly.','count':len(files),'files':sorted(files,key=lambda row:row['path'])}
open(output+'/report.json','w').write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':report['status'],'count':len(files)}))
