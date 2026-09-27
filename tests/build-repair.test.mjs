import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkWindowKeys, checkDesktopConfig, RELEASED_WINDOW_KEYS } from '../scripts/windows/check-desktop-config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(path.join(root, name), 'utf8');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));

// The small fixtures below exercise OUR validator. They do not simulate a real
// Tauri build. The launcher separately checks the user's installed CLI schema.
const schema = { definitions: { WindowConfig: { properties: Object.fromEntries(RELEASED_WINDOW_KEYS.map(k => [k, {}])) } } };
test('0.2.5 removes the unsupported noRedirectionBitmap setting and preserves the borderless window', () => {
  assert.equal(Object.hasOwn(config.app.windows[0], 'noRedirectionBitmap'), false);
  assert.equal(config.app.windows[0].decorations, false);
  assert.equal(config.app.windows[0].transparent, true);
  assert.doesNotThrow(() => checkWindowKeys(config));
});
test('the exact 0.2.4 window setting fails the released-runtime key check', () => {
  const previous = structuredClone(config);
  previous.app.windows[0].noRedirectionBitmap = true;
  assert.throws(() => checkWindowKeys(previous), /noRedirectionBitmap.*not supported/);
});
test('a newer/permissive CLI cannot conceal an unsupported Rust runtime key', () => {
  const previous = structuredClone(config);
  previous.app.windows[0].noRedirectionBitmap = true;
  const permissive = structuredClone(schema);
  permissive.definitions.WindowConfig.properties.noRedirectionBitmap = {};
  assert.throws(() => checkWindowKeys(previous, permissive), /runtime baseline/);
});
test('an older installed CLI schema is checked too', () => {
  const older = structuredClone(schema);
  delete older.definitions.WindowConfig.properties.dragDropEnabled;
  assert.throws(() => checkWindowKeys(config, older), /dragDropEnabled.*CLI schema/);
});
test('malformed window data and CLI schemas fail with actionable messages', () => {
  assert.throws(() => checkWindowKeys({}), /app.windows/);
  assert.throws(() => checkWindowKeys({ app: { windows: [null] } }), /must be an object/);
  assert.throws(() => checkWindowKeys(config, {}), /npm install/);
});
test('source versions agree and missing CLI is not reported as validated', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'vsualize-config-'));
  try {
    mkdirSync(path.join(temporary, 'src-tauri'));
    for (const file of ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml']) {
      writeFileSync(path.join(temporary, file), read(file));
    }
    assert.deepEqual(checkDesktopConfig(temporary), { version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version, cliSchemaChecked: false });
    assert.throws(() => checkDesktopConfig(temporary, { requireCli: true }), /missing/);
    const different = structuredClone(config); different.version = '0.2.4';
    writeFileSync(path.join(temporary, 'src-tauri/tauri.conf.json'), JSON.stringify(different));
    assert.throws(() => checkDesktopConfig(temporary), /Mixed source versions/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
test('launcher captures stderr inside CMD and records native exit status rather than relying on transcription', () => {
  const common = read('scripts/windows/windows-common.ps1');
  const start = read('scripts/windows/start-windows.ps1');
  assert.match(common, /\$Command \+ ' 2>&1'/);
  assert.match(common, /\$code = \$LASTEXITCODE/);
  assert.match(common, /WriteLine\(\$Text\)/);
  assert.match(common, /AutoFlush = \$true/);
  assert.doesNotMatch(start, /Start-Transcript/);
  assert.match(start, /Invoke-VsualizeCommand 'npm\.cmd run build:windows -- --verbose'/);
  assert.match(start, /Invoke-VsualizeCommand 'cargo\.exe test/);
});
test('Windows PowerShell 5.1 parses the scripts and logs real stdout/stderr/failed exit codes', { skip: process.platform !== 'win32' ? 'Requires Windows PowerShell 5.1; not executed on Linux.' : false }, () => {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tests/windows-build-logging.ps1')], { encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
});
