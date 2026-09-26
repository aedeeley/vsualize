import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  hidden = false; disabled = false; textContent = ''; title = '';
  listeners = new Map();
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  async click() { if (!this.disabled) await this.listeners.get('click')?.(); }
}
let elements, calls, callbacks, replies, onProgress;
globalThis.window = {
  __TAURI__: {
    core: { async invoke(command, args) {
      calls.push({ command, args });
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return reply;
    } },
    event: { async listen(_event, listener) { onProgress = listener; return () => {}; } },
  },
  setTimeout(callback) { callbacks.push(callback); return 1; },
  setInterval() { return 2; },
};
globalThis.document = { hidden: false, getElementById: id => elements.get(id) };
const { initializeUpdater } = await import('../dist/updater.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  elements = new Map(['app-updates', 'check-updates', 'install-update', 'update-status'].map(id => [id, new Element()]));
  elements.get('install-update').hidden = true;
  calls = []; callbacks = []; replies = [];
  initializeUpdater();
  return Object.fromEntries(elements);
}

test('automatic discovery never installs; explicit install uses the reviewed version', async () => {
  const ui = setup();
  replies.push({ currentVersion: '0.3.0', version: '0.3.1', notes: 'Faster effects' });
  callbacks[0](); await flush();
  assert.deepEqual(calls.map(call => call.command), ['check_update']);
  assert.equal(ui['install-update'].hidden, false);
  assert.match(ui['update-status'].textContent, /0\.3\.1/);
  await ui['install-update'].click();
  assert.deepEqual(calls.at(-1), { command: 'install_update', args: { version: '0.3.1' } });
});

test('failed downloads reenable controls and allow retrying the same signed release', async () => {
  const ui = setup();
  replies.push({ currentVersion: '0.3.0', version: '0.3.1', notes: null });
  await ui['check-updates'].click(); await flush();
  replies.push(new Error('connection interrupted'));
  await ui['install-update'].click();
  assert.equal(ui['check-updates'].disabled, false);
  assert.equal(ui['install-update'].disabled, false);
  assert.match(ui['update-status'].textContent, /try again/);
  replies.push(new Error('signature rejected'));
  await ui['install-update'].click();
  assert.equal(calls.filter(call => call.command === 'install_update').length, 2);
  assert.equal(calls.at(-1).args.version, '0.3.1');
  assert.equal(ui['install-update'].disabled, false);
});

test('a current installation hides install and release notes remain plain text', async () => {
  const ui = setup();
  replies.push({ currentVersion: '0.3.0', version: null, notes: '<script>unsafe()</script>' });
  await ui['check-updates'].click(); await flush();
  assert.equal(ui['install-update'].hidden, true);
  assert.match(ui['update-status'].textContent, /up to date/);
  assert.equal(ui['update-status'].title, '<script>unsafe()</script>');
  assert.equal(calls.length, 1);
});

test('download progress tolerates absent length and caps the displayed percentage', async () => {
  const ui = setup();
  await flush();
  onProgress({ payload: { phase: 'downloading', downloaded: 200, total: null } });
  assert.equal(ui['update-status'].textContent, 'Downloading update…');
  onProgress({ payload: { phase: 'downloading', downloaded: 200, total: 100 } });
  assert.match(ui['update-status'].textContent, /100%/);
  onProgress({ payload: { phase: 'installing', downloaded: 0, total: null } });
  assert.match(ui['update-status'].textContent, /Verifying and installing/);
});
