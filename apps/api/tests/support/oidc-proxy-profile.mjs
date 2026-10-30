import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const run = promisify(execFile),
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fileHash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
// This adapter only validates the operator's existing process; the shared helper owns alias lifecycle.
export async function verifiedProxyProfile(manifestPath, expectedManifestSha256) {
  assert(
    manifestPath && /^[a-f0-9]{64}$/u.test(expectedManifestSha256 ?? ''),
    'Explicit reviewed proxy manifest is required',
  );
  const bytes = await readFile(manifestPath);
  assert.equal(hash(bytes), expectedManifestSha256, 'Proxy manifest changed');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, 'RESTORED_PROXY_ONLY');
  assert(Number.isSafeInteger(manifest.pid) && manifest.pid > 0);
  assert.equal(manifest.uid, 0);
  assert.deepEqual(manifest.profile.tlds, ['demo']);
  assert.equal(manifest.profile.port, 443);
  assert.equal(manifest.profile.https, true);
  assert.equal(manifest.profile.tld, 'demo');
  assert.equal(manifest.profile.lan, false);
  assert.equal(manifest.profile.strictRouting, true);
  assert.equal(manifest.profile.syncHosts, true);
  assert.equal(manifest.profile.customCert, false);
  assert.equal(manifest.profile.skipTrust, true);
  assert.equal(manifest.stateDir, '/Users/hoadev/.portless');
  assert.equal(manifest.portlessVersion, '0.15.11');
  assert.equal(manifest.workerBinding.requireVerifiedPid, manifest.pid);
  assert.equal(manifest.workerBinding.requireUid, 0);
  assert.equal(
    manifest.guard.policySha256,
    'a0074bc65b295dccfcc5672d6fd8ac174e48a8fa0c91f177a0393c92b07e3647',
  );
  assert.equal(manifest.guard.rootDummyVerified, true);
  assert.equal(manifest.guard.nativeCommandMatchesFrozenProposal, true);
  const ps = (
    await run('ps', ['-ww', '-p', String(manifest.pid), '-o', 'pid=,uid=,lstart=,command='])
  ).stdout.trim();
  const match = ps.match(
    /^(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+([\s\S]+)$/u,
  );
  assert(match, 'Proxy process is absent or malformed');
  assert.equal(Number(match[1]), manifest.pid);
  assert.equal(Number(match[2]), 0);
  assert.equal(match[3].replace(/\s+/gu, ' '), manifest.psStartTime.replace(/\s+/gu, ' '));
  assert.equal(match[4], manifest.argv.join(' '), 'Proxy argv changed');
  assert.equal(manifest.sourceFiles.length, 5);
  for (const file of manifest.sourceFiles) {
    const current = await stat(file.path);
    assert.equal(await realpath(file.path), file.realpath);
    assert.equal(current.size, file.bytes);
    assert.equal(current.uid, file.uid);
    assert.equal(current.gid, file.gid);
    assert.equal('0o' + (current.mode & 0o777).toString(8), file.mode);
    assert.equal(await fileHash(file.path), file.sha256, 'Proxy binary/source changed');
  }
  const cli = manifest.sourceFiles.find((file) => file.path.endsWith('/portless/dist/cli.js'));
  assert(cli);
  assert.equal(cli.sha256, '0d8817db6eaf8819057dcaebb8e6eb7465d1119ff722048a73e847d4588b9636');
  for (const [name, value] of Object.entries(manifest.profile.publicStateMarkers))
    assert.equal(
      (await readFile(resolve(manifest.stateDir, name), 'utf8')).trim(),
      value,
      'Proxy public marker changed',
    );
  assert.equal(process.env.NODE_EXTRA_CA_CERTS, resolve(manifest.stateDir, 'ca.pem'));
  for (const name of [
    'ca.pem',
    'host-certs/identity-service_demo.pem',
    'host-certs/datamaker-task_demo.pem',
  ]) {
    const certificate = manifest.certificates.find((item) => item.name === name);
    assert(certificate);
    assert.equal(
      await fileHash(resolve(manifest.stateDir, name)),
      certificate.pemSha256,
      'Public CA/certificate changed',
    );
  }
  return {
    pid: manifest.pid,
    summary: {
      manifestPath,
      manifestSha256: expectedManifestSha256,
      pid: manifest.pid,
      uid: 0,
      psStartTime: manifest.psStartTime,
      exactArgv: true,
      sourceFiles: 5,
      profile: 'loopback443/80 HTTPS .demo LAN0 strict',
      readOnlyCertificateGuard: true,
      osDNSAcceptance: false,
      browserAcceptance: false,
    },
  };
}
