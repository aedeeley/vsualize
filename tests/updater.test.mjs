import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  hidden = false; disabled = false; textContent = ''; title = ''; open = false; href = '';
  listeners = new Map();
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  async click() { if (!this.disabled) await this.listeners.get('click')?.({ preventDefault() {} }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() {}
}
let elements, calls, callbacks, replies, onProgress, timeouts, windowListeners, documentListeners;
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
  setTimeout(callback, delay) { callbacks.push(callback); timeouts.push(delay); return callbacks.length; },
  clearTimeout() {},
  addEventListener(name, callback) { windowListeners.set(name, callback); },
};
globalThis.document = { hidden: false, getElementById: id => elements.get(id), addEventListener(name, callback) { documentListeners.set(name, callback); } };
const { initializeUpdater, UPDATE_CHECK_INTERVAL } = await import('../dist/updater.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  elements = new Map(['app-updates', 'check-updates', 'install-update', 'update-status', 'update-dialog', 'update-dialog-install', 'update-dialog-later', 'update-dialog-message', 'update-dialog-status', 'update-changelog'].map(id => [id, new Element()]));
  elements.get('install-update').hidden = true;
  calls = []; callbacks = []; replies = []; timeouts = []; windowListeners = new Map(); documentListeners = new Map(); document.hidden = false;
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
  assert.equal(ui['update-dialog'].open, true);
  assert.equal(timeouts[0], 0, 'checks on startup');
  assert.ok(timeouts.at(-1) <= 12 * 60 * 60 * 1000 && timeouts.at(-1) >= 12 * 60 * 60 * 1000 - 100);
  await ui['install-update'].click();
  assert.deepEqual(calls.at(-1), { command: 'install_update', args: { version: '0.3.1' } });
});

test('Later and Escape dismiss without installing, and the next 12-hour check can remind again', async () => {
  const ui = setup();
  replies.push({ currentVersion: '0.4.0', version: '0.4.1', notes: null });
  callbacks[0](); await flush();
  await ui['update-dialog-later'].click();
  assert.equal(ui['update-dialog'].open, false);
  assert.equal(calls.filter(c => c.command === 'install_update').length, 0);
  replies.push({ currentVersion: '0.4.0', version: '0.4.1', notes: null });
  callbacks.at(-1)(); await flush();
  assert.equal(ui['update-dialog'].open, true);
  let prevented = false;
  ui['update-dialog'].listeners.get('cancel')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(ui['update-dialog'].open, false);
  assert.equal(calls.filter(c => c.command === 'check_update').length, 2);
});

test('a hidden app still checks but defers the prompt until visible', async () => {
  const ui = setup(); document.hidden = true;
  replies.push({ currentVersion: '0.4.0', version: '0.4.1', notes: null });
  callbacks[0](); await flush();
  assert.equal(calls.length, 1);
  assert.equal(ui['update-dialog'].open, false);
  document.hidden = false; documentListeners.get('visibilitychange')();
  assert.equal(ui['update-dialog'].open, true);
  assert.equal(calls.length, 1);
});

test('returning after sleep catches up once without duplicate checks on focus', async () => {
  const ui = setup();
  replies.push({ currentVersion: '0.4.0', version: null, notes: null });
  callbacks[0](); await flush();
  const now = Date.now;
  try {
    const resumed = now() + UPDATE_CHECK_INTERVAL + 1;
    Date.now = () => resumed;
    replies.push({ currentVersion: '0.4.0', version: null, notes: null });
    windowListeners.get('focus')(); documentListeners.get('visibilitychange')(); await flush();
    assert.equal(calls.length, 2);
    assert.equal(ui['update-dialog'].open, false);
  } finally { Date.now = now; }
});

test('changelog opens the reviewed release in the browser without installing', async () => {
  const ui = setup();
  replies.push({ currentVersion: '0.4.0', version: '0.4.1', notes: null });
  callbacks[0](); await flush();
  assert.equal(ui['update-changelog'].href, 'https://github.com/aedeeley/vsualize/releases/tag/v0.4.1');
  await ui['update-changelog'].click(); await flush();
  assert.deepEqual(calls.at(-1), { command: 'open_update_changelog', args: { version: '0.4.1' } });
  assert.equal(ui['update-dialog'].open, true);
});

test('automatic network errors remain quiet and schedule another check', async () => {
  const ui = setup(); replies.push(new Error('offline'));
  callbacks[0](); await flush();
  assert.equal(ui['update-dialog'].open, false);
  assert.equal(ui['update-status'].textContent, '');
  assert.ok(timeouts.at(-1) <= UPDATE_CHECK_INTERVAL && timeouts.at(-1) >= UPDATE_CHECK_INTERVAL - 100);
  assert.equal(ui['check-updates'].disabled, false);
});

test('an in-progress installation cannot be dismissed or changed by a scheduled check', async () => {
  const ui = setup();
  replies.push({ currentVersion: '0.4.0', version: '0.4.1', notes: null });
  callbacks[0](); await flush();
  let reject;
  replies.push(new Promise((_resolve, fail) => { reject = fail; }));
  const install = ui['update-dialog-install'].click(); await flush();
  assert.equal(ui['update-dialog-later'].disabled, true);
  ui['update-dialog'].listeners.get('cancel')({ preventDefault() {} });
  callbacks.at(-1)(); await flush();
  assert.equal(ui['update-dialog'].open, true);
  assert.equal(calls.filter(c => c.command === 'check_update').length, 1);
  reject(new Error('Download interrupted')); await install;
  assert.match(ui['update-dialog-status'].textContent, /try again/);
  assert.equal(ui['update-dialog-later'].disabled, false);
  await ui['update-dialog-later'].click();
  assert.equal(ui['update-dialog'].open, false);
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
