import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PALETTES, sanitizeSettings, silentFrame, demoFrame, loadSettings, saveSettings, hexRGB } from '../dist/settings.js';
import { VISUAL_IDS } from '../dist/catalog.js';
import { matchesVisual, nextVisual } from '../dist/library.js';
import { THUMBNAILS } from '../dist/visuals/thumbnails.js';
import { VISUALS } from '../dist/visuals/index.js';

test('defaults match the agreed first-launch behavior', () => {
  assert.equal(DEFAULTS.visual, 'soundform'); assert.equal(DEFAULTS.mode, 'desktop'); assert.equal(DEFAULTS.quality, 'auto');
  assert.equal(DEFAULTS.menuPosition, 'bottom-right'); assert.equal(DEFAULTS.hideTaskbar, false);
});
test('invalid stored values fall back instead of reaching graphics/audio APIs', () => {
  for (const value of [null, [], 'bad', 42]) assert.deepEqual(sanitizeSettings(value), DEFAULTS);
  const s = sanitizeSettings({ visual: 'missing', mode: 'random', background: 'video', fps: -1, sensitivity: NaN, backgroundColor: 'url(bad)', hideTaskbar: 'true' });
  assert.deepEqual(s, DEFAULTS);
});
test('settings clamp finite numeric values and ignore unknown keys', () => {
  const s = sanitizeSettings({ ...DEFAULTS, intensity: 999, motion: -9, glow: 3, opacity: -2, sensitivity: 100, desktopGain: -1, noiseGate: 9, unknown: 'bad' });
  assert.equal(s.intensity, 3); assert.equal(s.motion, 0); assert.equal(s.glow, 1);
  assert.equal(s.opacity, 0.1); assert.equal(s.sensitivity, 4); assert.equal(s.desktopGain, 0);
  assert.equal(s.noiseGate, 0.025); assert.ok(!('unknown' in s));
});
test('stored settings persist and corrupted storage is recovered', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
  const s = sanitizeSettings({ ...DEFAULTS, visual: 'glass', background: 'transparent' });
  assert.equal(saveSettings(s), true); assert.deepEqual(loadSettings(), s);
  store.set('vsualize.settings.v1', 'broken json'); assert.deepEqual(loadSettings(), DEFAULTS);
  delete globalThis.localStorage;
});
test('storage unavailability is reported without crashing', () => {
  globalThis.localStorage = { getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadSettings(), DEFAULTS); assert.equal(saveSettings(DEFAULTS), false);
  delete globalThis.localStorage;
});
test('silence has no fabricated energy or shared arrays', () => {
  const a = silentFrame(), b = silentFrame();
  assert.equal(a.spectrum.length, 128); assert.equal(a.waveform.length, 256);
  assert.ok(a.spectrum.every(n => n === 0)); assert.equal(a.beat, 0);
  a.spectrum[0] = 1; assert.equal(b.spectrum[0], 0);
});
test('explicit demo signal is deterministic and bounded over ten minutes', () => {
  assert.deepEqual(demoFrame(2), demoFrame(2));
  for (let i = 0; i < 600; i++) {
    const f = demoFrame(i + 0.127);
    assert.match(f.desktopStatus, /Demo signal/);
    for (const n of [f.volume, f.bass, f.mid, f.treble, f.beat, ...f.spectrum]) assert.ok(Number.isFinite(n) && n >= 0 && n <= 1);
    for (const n of f.waveform) assert.ok(Number.isFinite(n) && Math.abs(n) <= 1);
  }
});
test('all 12 visualizers have distinct shader bodies, metadata and valid palettes', () => {
  assert.deepEqual(Object.keys(VISUALS), VISUAL_IDS); assert.equal(VISUAL_IDS.length, 12);
  assert.equal(new Set(Object.values(VISUALS).map(v=>v.fragment)).size, 12);
  for (const [id, v] of Object.entries(VISUALS)) {
    assert.equal(v.id, id); assert.ok(v.fragment.startsWith('#version 300 es'));
    assert.match(v.fragment, /void main\(/); assert.ok(PALETTES[v.palette]); assert.ok(v.category); assert.ok(['light','medium','heavy'].includes(v.cost));
  }
});
test('hex colors normalize correctly', () => {
  assert.deepEqual(hexRGB('#ffffff'), [1, 1, 1]); assert.deepEqual(hexRGB('#000000'), [0, 0, 0]);
});

test('favorites sanitize, deduplicate and never share a mutable default array', () => {
  const s = sanitizeSettings({ favorites: ['mandala', 'bad', 8, 'mandala', 'lava'] });
  assert.deepEqual(s.favorites, ['mandala', 'lava']);
  const a = sanitizeSettings(null), b = sanitizeSettings(null); a.favorites.push('glass');
  assert.deepEqual(b.favorites, []); assert.deepEqual(DEFAULTS.favorites, []);
});
test('the existing v1 settings schema migrates without losing original choices', () => {
  const s = sanitizeSettings({ version: 1, visual:'glass', opacity:0.7, menuPosition:'top-left' });
  assert.equal(s.visual,'glass'); assert.equal(s.opacity,.7); assert.equal(s.menuPosition,'top-left'); assert.deepEqual(s.favorites,[]);
});
test('all 7 retained reference names find their matching visual', () => {
  const refs=Object.values(VISUALS).filter(v=>v.reference); assert.ok(refs.length >= 7);
  for (const v of refs) assert.ok(matchesVisual(v,v.reference,'All',false,[]));
  assert.ok(matchesVisual(VISUALS.organism,'acid-physarum-amoeba','All',false,[]));
  assert.ok(matchesVisual(VISUALS.dissolution,'disolve','All',false,[]));
});
test('category and favorites filters compose with search', () => {
  const v=VISUALS.kaleidoscope;
  assert.equal(matchesVisual(v,'kaleidoscope','Fractal',true,['kaleidoscope']),true);
  assert.equal(matchesVisual(v,'kaleidoscope','Tunnel',false,[]),false);
  assert.equal(matchesVisual(v,'kaleidoscope','All',true,[]),false);
  assert.equal(matchesVisual(v,'nonexistent','All',false,[]),false);
});
test('navigation uses collection length, handles empty pools and wraps both ways', () => {
  assert.equal(nextVisual('soundform',-1,VISUAL_IDS),'lava');
  assert.equal(nextVisual('lava',1,VISUAL_IDS),'soundform');
  assert.equal(nextVisual('glass',1,[]),'glass');
  assert.equal(nextVisual('glass',1,['mandala','kaleidoscope']),'mandala');
  assert.equal(nextVisual('glass',-1,['mandala','kaleidoscope']),'kaleidoscope');
});
test('every preset ships an embedded thumbnail with no network dependency', () => {
  for (const id of VISUAL_IDS) assert.match(THUMBNAILS[id],/^data:image\/jpeg;base64,/);
});


test('same-origin Resonance settings migrate to Vsualize without deleting the original', () => {
  const legacy = sanitizeSettings({ ...DEFAULTS, visual: 'glass', favorites: ['kaleidoscope'] });
  const store = new Map([['resonance.settings.v1', JSON.stringify(legacy)]]);
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  try {
    assert.deepEqual(loadSettings(), legacy);
    assert.deepEqual(JSON.parse(store.get('vsualize.settings.v1')), legacy);
    assert.ok(store.has('resonance.settings.v1'));
  } finally { delete globalThis.localStorage; }
});

test('current Vsualize settings take precedence over legacy preferences', () => {
  const current = sanitizeSettings({ ...DEFAULTS, visual: 'lava' });
  const store = new Map([
    ['resonance.settings.v1', JSON.stringify({ ...DEFAULTS, visual: 'glass' })],
    ['vsualize.settings.v1', JSON.stringify(current)]
  ]);
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  try { assert.deepEqual(loadSettings(), current); }
  finally { delete globalThis.localStorage; }
});

test('legacy preferences remain readable when storage refuses migration writes', () => {
  const legacy = sanitizeSettings({ ...DEFAULTS, visual: 'organism' });
  globalThis.localStorage = {
    getItem: key => key === 'resonance.settings.v1' ? JSON.stringify(legacy) : null,
    setItem() { throw new Error('read-only'); }
  };
  try { assert.deepEqual(loadSettings(), legacy); }
  finally { delete globalThis.localStorage; }
});
