import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function makeManifest(version, filename, signature, notes = '', date = new Date().toISOString()) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Stable releases require a numeric major.minor.patch version.');
  if (!/^[A-Za-z0-9._-]+-setup\.exe$/.test(filename) || !filename.includes(`_${version}_`)) throw new Error('Installer name/version mismatch.');
  const decoded = Buffer.from(signature.trim(), 'base64').toString('utf8');
  if (!decoded.startsWith('untrusted comment:') || !decoded.includes('trusted comment:')) throw new Error('Missing or malformed Tauri signature.');
  const trustedComment = decoded.split(/\r?\n/).find(line => line.startsWith('trusted comment:')) ?? '';
  if (!trustedComment.split(/\s+/).includes(`version:${version}`)) throw new Error('The signature must bind this exact release version.');
  return {
    version, notes, pub_date: date,
    platforms: { 'windows-x86_64': {
      signature: signature.trim(),
      url: `https://github.com/aedeeley/vsualize/releases/download/v${version}/${filename}`,
    } },
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error('Git tag must match all source versions.');
  const dir = path.resolve(root, process.argv[2] ?? 'src-tauri/target/release/bundle/nsis');
  const files = (await readdir(dir)).filter(name => name.endsWith('-setup.exe'));
  if (files.length !== 1) throw new Error('Expected exactly one installer in the release directory.');
  const filename = files[0];
  const signature = await readFile(path.join(dir, `${filename}.sig`), 'utf8');
  const notes = await readFile(path.join(root, 'docs', `RELEASE-${version}.md`), 'utf8');
  const manifest = makeManifest(version, filename, signature, notes);
  await writeFile(path.join(dir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const checksums = [];
  for (const name of [filename, `${filename}.sig`, 'latest.json']) {
    checksums.push(`${createHash('sha256').update(await readFile(path.join(dir, name))).digest('hex')}  ${name}`);
  }
  await writeFile(path.join(dir, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  console.log(`Prepared signed Windows ${version} update manifest and SHA-256 checksums.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
