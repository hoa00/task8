"""Bounded captured WU16 owner-byte bridge; historical clips remain historical."""
import difflib
import hashlib
import json
import pathlib
import subprocess
import sys

out = pathlib.Path('docs/poc/evidence/WU-29/attempts') / sys.argv[1]
out.mkdir()
baseline = '537912fe78c6d91e0c122e4918ff90aae331d81b'
captured_path = pathlib.Path('docs/poc/evidence/WU-16/full-raster-linux-candidate.json')
captured = json.loads(captured_path.read_text())['implementationAssetsAfter']
def ref(path):
    body = path.read_bytes()
    return dict(path=str(path), bytes=len(body), sha256=hashlib.sha256(body).hexdigest())
files = [
    'apps/web/src/features/projects/ProjectFormDialog.tsx',
    'apps/web/src/features/projects/ProjectOverlayHost.tsx',
    'apps/web/src/features/projects/ShareDialog.tsx',
    'apps/web/src/features/projects/project-motion.ts',
    'apps/web/src/features/projects/projects.css',
    'packages/ui/src/controls.tsx',
    'packages/ui/src/overlays.tsx',
    'packages/ui/src/styles/overlays.css',
    'packages/ui/src/styles/theme.css',
    'apps/web/src/features/people/MemberIdentity.tsx',
]
rows = []
for index, file in enumerate(files):
    argv = ['git', 'show', baseline + ':' + file]
    before = out / (str(index) + '.captured-source.txt')
    stderr = out / (str(index) + '.stderr.txt')
    with before.open('wb') as stdout_handle, stderr.open('wb') as stderr_handle:
        command = subprocess.run(argv, stdout=stdout_handle, stderr=stderr_handle, check=False)
    receipt = dict(argv=argv, returncode=command.returncode, stdout=ref(before), stderr=ref(stderr))
    (out / (str(index) + '.execution.json')).write_text(json.dumps(receipt, indent=2) + '\n')
    assert command.returncode == 0, receipt
    assert ref(before)['sha256'] == captured[file], file
    current = pathlib.Path(file)
    copied = out / (str(index) + '.current-source.txt')
    copied.write_bytes(current.read_bytes())
    diff = out / (str(index) + '.diff.txt')
    diff.write_text(''.join(difflib.unified_diff(before.read_text().splitlines(True), copied.read_text().splitlines(True), fromfile=baseline + ':' + file, tofile='current:' + file)))
    rows.append(dict(path=file, capturedExpectedSha256=captured[file], before=ref(before), current=ref(current), snapshot=ref(copied), diff=ref(diff), byteUnchanged=before.read_bytes() == current.read_bytes(), execution=ref(out / (str(index) + '.execution.json'))))
report = dict(status='captured-owner-bytes-verified-branch-review-required', capturedCommit=baseline, capturedReport=ref(captured_path), owners=rows,
    scope='Ten actual captured owner files. Changed source bytes require the explicit branch/markup disposition in M2_REPORT; no whole current modal or bundle parity is inferred from historical clips.',
    historicalEvidence='Eight accepted WU16 Linux whole dialog clips, not current assembled AppShell. Earlier WU16 visual-verification failures remain failed.',
    currentBehavior='Current native Projects 28 probes and TaskForm/Modal boundary evidence are separate.')
(out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(attempt=sys.argv[1], owners=len(rows), unchanged=sum(row['byteUnchanged'] for row in rows))))
