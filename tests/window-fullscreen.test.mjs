import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const classes = new Set();
let fullscreen = false;
let failAction = false;
let reads = 0;
const calls = [];
const defaultGetter = async () => { reads++; return fullscreen; };
let getter = defaultGetter;
globalThis.document = {
  fullscreenElement: null,
  body: { classList: {
    toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
    remove(name) { classes.delete(name); },
  } },
};
globalThis.window = { __TAURI__: {
  core: {
    async invoke(command, args) {
      calls.push([command, args]);
      if (failAction) throw new Error('Window command rejected');
      if (args.action === 'fullscreen') fullscreen = !fullscreen;
      if (args.action === 'exit-fullscreen') fullscreen = false;
    },
    Channel: class {},
  },
  window: { getCurrentWindow: () => ({ isFullscreen: () => getter() }) },
} };
const native = await import('../dist/native.js');
beforeEach(() => {
  classes.clear(); fullscreen = false; failAction = false; reads = 0; calls.length = 0; getter = defaultGetter;
});

test('windowed startup keeps the 8px CSS default', async () => {
  await native.syncWindowCorners();
  assert.equal(classes.has('window-fullscreen'), false);
  assert.equal(reads, 1);
});
test('successful native fullscreen action reads real state and removes rounding', async () => {
  await native.windowAction('fullscreen');
  assert.equal(fullscreen, true);
  assert.equal(classes.has('window-fullscreen'), true);
  assert.deepEqual(calls, [['window_action', { action: 'fullscreen', value: null }]]);
  await native.windowAction('fullscreen');
  assert.equal(classes.has('window-fullscreen'), false);
});
test('exit fullscreen and recovery restore the windowed radius', async () => {
  fullscreen = true; await native.syncWindowCorners();
  await native.windowAction('exit-fullscreen');
  assert.equal(classes.has('window-fullscreen'), false);
  fullscreen = true; await native.syncWindowCorners();
  fullscreen = false; await native.syncWindowCorners();
  assert.equal(classes.has('window-fullscreen'), false);
});
test('ready syncs restored state without requesting fullscreen', async () => {
  fullscreen = true;
  await native.windowAction('ready');
  assert.equal(classes.has('window-fullscreen'), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].action, 'ready');
});
test('failed fullscreen command does not change the clip', async () => {
  failAction = true;
  await assert.rejects(native.windowAction('fullscreen'), /rejected/);
  assert.equal(classes.has('window-fullscreen'), false);
  assert.equal(reads, 0);
});
test('cosmetic getter failure preserves last state without breaking commands', async () => {
  fullscreen = true; await native.syncWindowCorners();
  getter = async () => { throw new Error('State unavailable'); };
  await assert.doesNotReject(native.syncWindowCorners());
  assert.equal(classes.has('window-fullscreen'), true);
  await assert.doesNotReject(native.windowAction('minimize'));
});
test('late stale fullscreen query cannot overwrite a newer result', async () => {
  const pending = [];
  getter = () => new Promise(resolve => pending.push(resolve));
  const older = native.syncWindowCorners();
  const newer = native.syncWindowCorners();
  pending[1](false); await newer;
  pending[0](true); await older;
  assert.equal(classes.has('window-fullscreen'), false);
});
test('missing fullscreen getter is cosmetic and does not break startup', async () => {
  const api = window.__TAURI__.window;
  try {
    delete window.__TAURI__.window;
    await assert.doesNotReject(native.syncWindowCorners());
    assert.equal(classes.has('window-fullscreen'), false);
  } finally { window.__TAURI__.window = api; }
});
test('unrelated window actions remain unchanged and do not query fullscreen', async () => {
  for (const [action, value] of [['drag'], ['resize', 'North'], ['layer', 'top'], ['taskbar', true]]) {
    await native.windowAction(action, value);
  }
  assert.equal(reads, 0);
  assert.deepEqual(calls.map(c => c[1].action), ['drag', 'resize', 'layer', 'taskbar']);
});
