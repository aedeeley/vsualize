import test from 'node:test';
import assert from 'node:assert/strict';

let reply, timers, elements;
globalThis.window = {
  __TAURI__: { core: { invoke: async () => reply() } },
  setTimeout(callback) { timers.set(1, callback); return 1; },
  clearTimeout(id) { timers.delete(id); },
};
globalThis.document = { getElementById: id => elements[id] };
const { initializeNowPlaying } = await import('../dist/now-playing.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  timers = new Map();
  elements = Object.fromEntries(['now-playing', 'song-title', 'song-artist'].map(id => [id, { hidden: true, textContent: '' }]));
  return initializeNowPlaying();
}

test('shows track details, updates them, and stops refreshing when dismissed', async () => {
  const ui = setup();
  reply = () => ({ title: 'First song', artist: 'First artist' });
  ui.show(); await flush();
  assert.equal(elements['song-title'].textContent, 'First song');
  assert.equal(elements['song-artist'].textContent, 'First artist');
  assert.equal(elements['now-playing'].hidden, false);
  reply = () => ({ title: 'Next song', artist: '' });
  timers.get(1)(); await flush();
  assert.equal(elements['song-title'].textContent, 'Next song');
  assert.equal(elements['song-artist'].hidden, true);
  ui.hide();
  assert.equal(elements['now-playing'].hidden, true);
  assert.equal(timers.size, 0);
});

test('missing or unavailable media hides old details and allows retry', async () => {
  const ui = setup();
  reply = () => ({ title: 'Song', artist: 'Artist' });
  ui.show(); await flush();
  reply = () => null;
  timers.get(1)(); await flush();
  assert.equal(elements['now-playing'].hidden, true);
  reply = () => { throw new Error('Media unavailable'); };
  timers.get(1)(); await flush();
  assert.equal(elements['now-playing'].hidden, true);
  assert.equal(timers.size, 1);
  ui.hide();
});

test('late response from a dismissed opening cannot replace the current track', async () => {
  const ui = setup();
  let finish;
  reply = () => new Promise(resolve => { finish = resolve; });
  ui.show(); ui.hide();
  reply = () => ({ title: 'Current song', artist: 'Current artist' });
  ui.show(); await flush();
  finish({ title: 'Old song', artist: 'Old artist' }); await flush();
  assert.equal(elements['song-title'].textContent, 'Current song');
  assert.equal(timers.size, 1);
  ui.hide();
});
