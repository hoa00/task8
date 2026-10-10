"""Freeze completed owned bytes and propose literal archive whitespace exceptions."""
import hashlib
import json
import pathlib
import re
import sys

ROOT=pathlib.Path('.')
BASE=pathlib.Path('docs/poc/evidence/WU-29')
attempt=sys.argv[1]
out=BASE/'attempts'/attempt
out.mkdir()
(out/'executed-freeze.py').write_bytes(pathlib.Path(__file__).read_bytes())
def ref(path):
    data=path.read_bytes()
    return dict(path=str(path),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
prestage=json.loads((BASE/'attempts/prestage-01/report.json').read_text())
assert prestage['status']=='passed-selected-index-raw-and-prestage'
paths=set(prestage['modified'])
paths.update(['apps/web/src/app/shell/route-entry-context.ts','apps/web/src/features/comments/TaskCommentDraftProvider.tsx','apps/web/src/features/comments/draft-context.ts'])
for directory in [BASE,pathlib.Path('tests/visual/m2')]:
    for path in directory.rglob('*'):
        if path.is_file() and not path.is_relative_to(out) and not path.is_relative_to(BASE/'raw'/attempt):paths.add(str(path))
records=[];exceptions=[]
for name in sorted(paths):
    path=pathlib.Path(name);record=ref(path);records.append(record)
    if not name.startswith(str(BASE)+'/'):continue
    try:text=path.read_text(encoding='utf8')
    except UnicodeDecodeError:continue
    bad=[i+1 for i,line in enumerate(text.splitlines()) if re.search(r'[\t ]+$|^ +\t',line)]
    blank_eof=text.endswith('\n\n')
    if bad or blank_eof:exceptions.append(dict(**record,lines=bad,blankAtEof=blank_eof))
manifest=out/'manifest.json';manifest.write_text(json.dumps(dict(status='finite-completed-owned-bytes',files=records,filesCount=len(records),bytes=sum(r['bytes'] for r in records),excluded=[str(out),str(BASE/'raw'/attempt)],qualification='Own output/self-manifest and running wrapper are excluded; no recursive self-growth. Every listed file was complete before freezing. Final metadata/outer receipt are separately reviewable actual bytes.'),indent=2)+'\n')
attributes=pathlib.Path('.gitattributes');prefix=ref(attributes)
proposal=out/'whitespace-proposal.json';proposal.write_text(json.dumps(dict(status='PROPOSED_NOT_APPLIED',prefix=prefix,exceptions=exceptions,scope='Only exact immutable WU29 archived original/log/executed-copy bytes. No active code or wildcard exception. Root authorization is required before applying.'),indent=2)+'\n')
append=out/'attributes-append.txt';append.write_text(''.join(row['path']+' -whitespace\n' for row in exceptions))
outputs=[out/name for name in ['executed-freeze.py','manifest.json','whitespace-proposal.json','attributes-append.txt','whitelist.json','candidate.json']]
anticipated=[BASE/'receipts/freeze-result-01.json']
whitelist=out/'whitelist.json';whitelist.write_text(json.dumps(dict(status='UNSTAGED_REVIEW_WHITELIST',files=sorted(paths|{str(p) for p in outputs}|{str(p) for p in anticipated}),conditionalAttributes='.gitattributes only after literal proposal authorization',excludedRunningWrapper=str(BASE/'raw'/attempt),qualification='Exact physical reviewed paths; anticipated outer receipt must exist before staging. Completed wrapper bytes will be explicitly added by Root review after completion.'),indent=2)+'\n')
candidate=out/'candidate.json';candidate.write_text(json.dumps(dict(status='IN_PROGRESS_PAUSED_AWAITING_ROOT_TECHNICAL',head=prestage['head'],manifest=ref(manifest),whitelist=ref(whitelist),whitespaceProposal=ref(proposal),attributesAppend=ref(append),indices=[ref(BASE/'indices/index-04'/name) for name in ['INVENTORY_INDEX.json','NATIVE_INDEX.json','ACTION_INDEX.json','REUSE_INDEX.json']],reports=[ref(BASE/'M2_REPORT.md'),ref(BASE/'EVIDENCE_INDEX.md'),ref(BASE/'HISTORICAL_DEBTS.md'),ref(pathlib.Path('docs/poc/PROGRESS.md')),ref(BASE/'attempts/prestage-01/report.json'),ref(BASE/'attempts/core-34/report.json'),ref(BASE/'archives/final-01/manifest.json')],rootPhysicalCapture=None,gate='Root technical/prestage then exact staged bytes; no stage/DONE/commit/push yet.'),indent=2)+'\n')
print(json.dumps(dict(attempt=attempt,files=len(records),bytes=sum(r['bytes'] for r in records),exceptions=len(exceptions),candidate=str(candidate))))
