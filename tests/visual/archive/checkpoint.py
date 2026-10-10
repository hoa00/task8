"""Execute only after the root's explicit bounded technical PASS.

All command text/stdout/stderr/status bytes are stored before parsing in /tmp,
then implementation proof is embedded in the two-file documentation checkpoint.
The documentation commit's own future SHA is never written recursively.
"""
import hashlib
import json
import os
import shlex
import subprocess
import sys

phase, attempt = sys.argv[1:3]
assert phase in ['implementation', 'docs']
base = 'f2daa4e27916949efc167c8dce09846b9610304c'
directory = '/tmp/task8-wu28-' + attempt
assert not os.path.exists(directory)
os.makedirs(directory)
records = []
checkpoint_path = 'docs/poc/evidence/WU-28/checkpoint.json'
progress_path = 'docs/poc/PROGRESS.md'
root_pass = json.load(open('docs/poc/evidence/WU-28/root-pass.json'))
assert root_pass['status'] == 'ROOT_TECHNICAL_PASS'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def run(name, args):
    index = len(records)
    command = (shlex.join(args) + '\n').encode()
    result = subprocess.run(args, capture_output=True)
    row = {'id': name, 'argv': args, 'exitStatus': result.returncode}
    for key, data in [('command', command), ('stdout', result.stdout), ('stderr', result.stderr)]:
        file = directory + '/' + str(index) + '-' + name + '.' + key
        with open(file, 'xb') as handle:
            handle.write(data)
        row[key] = {'path': file, 'bytes': len(data), 'sha256': digest(data), 'text': data.decode()}
    records.append(row)
    with open(directory + '/commands.json', 'w') as handle:
        json.dump(records, handle, indent=2)
        handle.write('\n')
    assert result.returncode == 0, name
    return result.stdout.decode().strip()

def proof():
    result = {}
    for key, args in [('head', ['git', 'rev-parse', 'HEAD']), ('tree', ['git', 'rev-parse', 'HEAD^{tree}']), ('parent', ['git', 'rev-parse', 'HEAD^']), ('origin', ['git', 'remote', 'get-url', 'origin'])]:
        result[key] = run(key, args)
    assert result['origin'] == 'https://github.com/hoa00/task8.git'
    result['beforePushStatus'] = run('before-push-status', ['git', 'status', '--porcelain'])
    assert result['beforePushStatus'] == ''
    run('normal-push', ['git', 'push', 'origin', 'HEAD:main'])
    run('fetch', ['git', 'fetch', 'origin', 'main'])
    result['originMain'] = run('origin-main', ['git', 'rev-parse', 'origin/main'])
    result['freshRemoteMain'] = run('fresh-remote-main', ['git', 'ls-remote', 'origin', 'refs/heads/main']).split()[0]
    result['divergence'] = run('divergence', ['git', 'rev-list', '--left-right', '--count', 'HEAD...origin/main'])
    result['afterPushStatus'] = run('after-push-status', ['git', 'status', '--porcelain'])
    assert result['head'] == result['originMain'] == result['freshRemoteMain']
    assert result['divergence'] == '0\t0' and result['afterPushStatus'] == ''
    result['sourceHead'] = run('source-head', ['git', '-C', '.reference/gr8r-studio', 'rev-parse', 'HEAD'])
    result['sourceTree'] = run('source-tree', ['git', '-C', '.reference/gr8r-studio', 'rev-parse', 'HEAD^{tree}'])
    result['sourceStatus'] = run('source-status', ['git', '-C', '.reference/gr8r-studio', 'status', '--porcelain'])
    result['sourceTracked'] = len(run('source-tracked', ['git', '-C', '.reference/gr8r-studio', 'ls-files']).splitlines())
    assert result['sourceHead'] == '904205c626918ee96054eb35495c394a60c0c601' and result['sourceTree'] == '5db5f992886b2345881946cf85fac098307953a5'
    assert result['sourceStatus'] == '' and result['sourceTracked'] == 86
    result['listeners'] = run('ports', ['ss', '-ltnH', 'sport = :4173 or sport = :5173 or sport = :8787'])
    assert result['listeners'] == ''
    expected = json.load(open('docs/poc/evidence/WU-28/archives/final-01/manifest.json'))['immutableInputs']
    result['lockedInputs'] = {name: digest(open('docs/poc/reference/' + name, 'rb').read()) for name in expected}
    assert result['lockedInputs'] == expected
    return result

run('cached-whitespace', ['git', 'diff', '--cached', '--check'])
if phase == 'implementation':
    assert run('prerequisite-head', ['git', 'rev-parse', 'HEAD']) == base
    run('implementation-commit', ['git', 'commit', '-m', 'feat(archive): complete WU-28 galleries and action integrations'])
    actual = proof()
    assert actual['parent'] == base
    checkpoint = {'unit': 'WU-28', 'status': 'DONE_BOUNDED_ROOT_TECHNICAL_PASS', 'implementation': actual, 'commands': records, 'rootPass': root_pass, 'scope': 'Actual implementation commit/tree/parent, normal push and fresh remote/clean/Source proof. This docs-only checkpoint never recursively records its own future commit SHA. All inherited failed/unaccepted WU29 debt remains intact.'}
    with open(checkpoint_path, 'w') as handle:
        json.dump(checkpoint, handle, indent=2)
        handle.write('\n')
    with open(progress_path, 'a') as handle:
        handle.write('\n- Actual WU28 implementation committed `' + actual['head'] + '` (tree `' + actual['tree'] + '`, parent `' + actual['parent'] + '`) and normal `git push origin HEAD:main` exit0. HEAD/origin-main/fresh remote-main match; divergence0/0, clean before/after push, locked Source904205/tree5db5/86tracked clean/four inputs unchanged/ports0. Exact raw command texts/stdout/stderr/SHA/size/status are embedded in [checkpoint](evidence/WU-28/checkpoint.json). This two-file documentation checkpoint follows; its actual SHA/tree/parent/push/remote/clean proof is reported separately without recursive self-SHA. STOP28 after that actual verification; WU29 requires a new owner.\n')
else:
    checkpoint = json.load(open(checkpoint_path))
    expected_changes = {progress_path, checkpoint_path}
    changed = set(run('docs-changes', ['git', 'diff', '--name-only']).splitlines())
    untracked = set(run('docs-untracked', ['git', 'ls-files', '--others', '--exclude-standard']).splitlines())
    assert changed | untracked == expected_changes
    run('docs-add', ['git', 'add', '--', progress_path, checkpoint_path])
    assert set(run('docs-staged', ['git', 'diff', '--cached', '--name-only']).splitlines()) == expected_changes
    staged_metadata = {}
    for file in sorted(expected_changes):
        staged = run('metadata-' + os.path.basename(file), ['git', 'show', ':' + file]).encode() + b'\n'
        # run() strips only for convenient scalar parsing; actual stdout bytes are
        # read from the already persisted command record for exact blob equality.
        actual_bytes = open(records[-1]['stdout']['path'], 'rb').read()
        work = open(file, 'rb').read()
        assert actual_bytes == work
        staged_metadata[file] = {'sha256': digest(work), 'bytes': len(work), 'gitBlob': run('blob-' + os.path.basename(file), ['git', 'rev-parse', ':' + file])}
    run('docs-cached-whitespace', ['git', 'diff', '--cached', '--check'])
    run('documentation-commit', ['git', 'commit', '-m', 'docs(poc): checkpoint WU-28 actual implementation push'])
    actual = proof()
    assert actual['parent'] == checkpoint['implementation']['head']
    actual['stagedMetadata'] = staged_metadata

with open(directory + '/result.json', 'w') as handle:
    json.dump({'phase': phase, 'actual': actual, 'commands': records}, handle, indent=2)
    handle.write('\n')
print(json.dumps({'phase': phase, 'head': actual['head'], 'tree': actual['tree'], 'parent': actual['parent'], 'remote': actual['freshRemoteMain'], 'clean': actual['afterPushStatus'] == '', 'proof': directory + '/result.json'}))
