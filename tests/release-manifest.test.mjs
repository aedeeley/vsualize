import test from 'node:test';
import assert from 'node:assert/strict';
import { makeManifest } from '../scripts/release-manifest.mjs';
const signature = Buffer.from('untrusted comment: test\nplaceholder\ntrusted comment: timestamp:123\tversion:0.3.0\nplaceholder').toString('base64');
test('update manifest points at an immutable tagged Windows release', () => {
  const manifest = makeManifest('0.3.0', 'Vsualize_0.3.0_x64-setup.exe', signature, 'Changes', '2026-09-26T00:00:00Z');
  assert.equal(manifest.platforms['windows-x86_64'].url, 'https://github.com/aedeeley/vsualize/releases/download/v0.3.0/Vsualize_0.3.0_x64-setup.exe');
  assert.equal(manifest.platforms['windows-x86_64'].signature, signature);
  assert.equal(manifest.notes, 'Changes');
});
test('release manifest rejects mismatched versions, unsafe filenames and missing signatures', () => {
  for (const [v, file, sig] of [
    ['v0.3.0', 'Vsualize_0.3.0_x64-setup.exe', signature],
    ['0.3.0', 'Vsualize_0.2.11_x64-setup.exe', signature],
    ['0.3.0', '../Vsualize_0.3.0_x64-setup.exe', signature],
    ['0.3.0', 'Vsualize_0.3.0_x64-setup.exe', ''],
    ['0.3.0', 'Vsualize_0.3.0_x64-setup.exe', Buffer.from('untrusted comment: test\nplaceholder\ntrusted comment: version:0.2.11\nplaceholder').toString('base64')],
  ]) assert.throws(() => makeManifest(v, file, sig));
});
