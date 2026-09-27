import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { VISUAL_IDS, CATEGORIES } from '../dist/catalog.js';
import { VISUALS } from '../dist/visuals/index.js';
import { THUMBNAILS } from '../dist/visuals/thumbnails.js';
import { DEFAULTS, sanitizeSettings, loadSettings, saveSettings } from '../dist/settings.js';
import { VISUAL_DEFAULTS, defaultVisualTuning } from '../dist/visual-presets.js';
import { matchesVisual, nextVisual } from '../dist/library.js';
import { RETIRED_VISUAL_IDS, pruneRetiredVisuals } from '../scripts/maintenance/prune-retired-visuals.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const removedNames = ['Orbital Vortex', 'Chromatic Vortex', 'Pulse Tunnel', 'Chromatic Chaos', 'Silk Weaver',
  'Prism Triangles', 'Luminous Lattice', 'Neural Constellation', 'Starflight', 'Nocturne Cube',
  'Petal Resonance', 'Iridescent Julia', 'Fractal Bloom', 'Spectral Cascade', 'Prismatic Highway'];
const removedAliases = ['Hpno+Vortex+Illusio', 'color-vortex-suck', 'pulse-warp-tunnel', 'rainbow-chaos-stars', 'sound-weaver',
  'volumetric-led-field', 'neural-constellation', 'star-traveling', 'dark-trance-particle-cube', 'flower-fractal-ripple',
  'fractal-orbit-film', 'fractal-symphony-bloom', 'neon-spectrogram-cascade', 'rainbow-boost-road'];

test('exactly twelve current effects ship with matching registry and thumbnails', () => {
  assert.deepEqual(VISUAL_IDS, ['soundform','soundform-topdown','glass','mandelbrot','spectrum','organism','overdrive','dissolution','mandala','kaleidoscope','groove','lava']);
  assert.equal(VISUAL_IDS.length, 12);
  for (const obj of [VISUALS, THUMBNAILS, VISUAL_DEFAULTS]) assert.deepEqual(Object.keys(obj).sort(), [...VISUAL_IDS].sort());
  assert.equal(RETIRED_VISUAL_IDS.length, 17);
  for (const id of RETIRED_VISUAL_IDS) {
    assert.ok(!VISUAL_IDS.includes(id));
    for (const obj of [VISUALS, THUMBNAILS, VISUAL_DEFAULTS]) assert.ok(!Object.hasOwn(obj, id));
    for (const file of [`src/visuals/${id}.ts`, `dist/visuals/${id}.js`]) assert.ok(!existsSync(path.join(root, file)), file);
  }
});

test('removed display names and reference aliases no longer resolve in the library', () => {
  for (const query of [...removedNames, ...removedAliases]) {
    assert.deepEqual(VISUAL_IDS.filter(id => matchesVisual(VISUALS[id], query, 'All', false, [])), [], query);
  }
});

test('every category has a retained effect; unused Space category is removed', () => {
  assert.ok(!CATEGORIES.includes('Space'));
  for (const c of CATEGORIES.filter(c => c !== 'All')) assert.ok(VISUAL_IDS.some(id => VISUALS[id].category === c), c);
});

test('a retired selection uses Soundform tuning instead of carrying discarded sliders into Soundform', () => {
  for (const visual of RETIRED_VISUAL_IDS) {
    const old = { ...DEFAULTS, visual, favorites: ['mandelbrot', ...RETIRED_VISUAL_IDS, 'glass', 'mandelbrot'],
      mode: 'both', desktopDevice: 'speaker-123', microphoneDevice: 'mic-456',
      desktopGain: .8, microphoneGain: 1.7, sensitivity: 2.2, noiseGate: .001,
      palette: 'ember', background: 'transparent', opacity: .63,
      menuPosition: 'top-left', smoothness: .91, reactivity: 1.85, motion: .42,
      hideTaskbar: true, idleMotion: true };
    const next = sanitizeSettings(old);
    assert.equal(next.visual, 'soundform'); assert.deepEqual(next.favorites, ['mandelbrot', 'glass']);
    for (const [key, value] of Object.entries(defaultVisualTuning('soundform'))) assert.equal(next[key], value);
    for (const key of ['mode','desktopDevice','microphoneDevice','desktopGain','microphoneGain','sensitivity','noiseGate','background','opacity','menuPosition','hideTaskbar','idleMotion']) assert.deepEqual(next[key], old[key], key);
  }
});

test('all retained selections keep their own saved settings and remaining favorites', () => {
  for (const visual of VISUAL_IDS) {
    const first = sanitizeSettings({ ...DEFAULTS, visual, favorites: [visual], lineWidth: .83, motion: 1.15 });
    assert.deepEqual(sanitizeSettings(first), first);
    assert.equal(first.visualTunings[visual].lineWidth, .83);
    assert.equal(first.visualTunings[visual].motion, 1.15);
  }
  assert.deepEqual(sanitizeSettings({ ...DEFAULTS, favorites: [...RETIRED_VISUAL_IDS] }).favorites, []);
});

test('current and legacy storage keys migrate removed selections and filter removed favorites', () => {
  for (const key of ['vsualize.settings.v1', 'resonance.settings.v1']) {
    const store = new Map([[key, JSON.stringify({ version: 1, visual: 'julia', favorites: ['orbital', 'soundform', 'julia', 'lava'], palette: 'ice' })]]);
    globalThis.localStorage = { getItem: name => store.get(name) ?? null, setItem: (name, value) => store.set(name, value) };
    try {
      const settings = loadSettings();
      assert.equal(settings.visual, 'soundform'); assert.equal(settings.palette, 'randomize');
      assert.deepEqual(settings.favorites, ['soundform', 'lava']);
      assert.ok(saveSettings(settings));
      assert.deepEqual(JSON.parse(store.get('vsualize.settings.v1')), settings);
    } finally { delete globalThis.localStorage; }
  }
});

test('navigation visits only retained effects and wraps at Lava Forms', () => {
  for (const direction of [-1, 1]) {
    let current = 'soundform'; const visited = new Set();
    for (let i = 0; i < VISUAL_IDS.length; i++) { visited.add(current); current = nextVisual(current, direction, VISUAL_IDS); }
    assert.equal(current, 'soundform'); assert.equal(visited.size, 12);
    assert.ok([...visited].every(id => VISUAL_IDS.includes(id)));
  }
  assert.equal(nextVisual('soundform', -1, VISUAL_IDS), 'lava');
});

test('generated preview contains only curated effect modules and shows 12 / 12', () => {
  const html = read('artifacts/preview/vsualize.html');
  for (const id of RETIRED_VISUAL_IDS) assert.ok(!html.includes(`"visuals/${id}.js":function`), id);
  for (const name of removedNames) assert.ok(!html.includes(name), name);
  assert.match(html, /12 \/ 12/);
  const { version } = JSON.parse(read('package.json'));
  assert.ok(html.includes(`Vsualize ${version}`));
});

test('folder-merge cleanup removes only retired files and can run repeatedly', async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'vsualize-pruning-'));
  try {
    mkdirSync(path.join(temp, 'src/visuals'), { recursive: true });
    for (const id of RETIRED_VISUAL_IDS) writeFileSync(path.join(temp, `src/visuals/${id}.ts`), `old ${id}`);
    const keep = ['src/visuals/soundform.ts', 'src/visuals/new-custom.ts', 'src/visuals/weaver-notes.txt',
      'node_modules/cache.txt', 'src-tauri/target/cache.txt', 'settings.json'];
    for (const file of keep) { mkdirSync(path.dirname(path.join(temp, file)), { recursive: true }); writeFileSync(path.join(temp, file), 'keep'); }
    assert.deepEqual(await pruneRetiredVisuals(temp), RETIRED_VISUAL_IDS.map(id => `src/visuals/${id}.ts`));
    assert.deepEqual(await pruneRetiredVisuals(temp), []);
    for (const file of keep) assert.equal(readFileSync(path.join(temp, file), 'utf8'), 'keep');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('cleanup refuses to recursively remove an unexpected directory', async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'vsualize-pruning-dir-'));
  try {
    const directory = path.join(temp, 'src/visuals/orbital.ts');
    mkdirSync(directory, { recursive: true }); writeFileSync(path.join(directory, 'keep.txt'), 'keep');
    await assert.rejects(pruneRetiredVisuals(temp), /not a directory/);
    assert.equal(readFileSync(path.join(directory, 'keep.txt'), 'utf8'), 'keep');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('upgrade cleanup is invoked before compilation', () => {
  const build = read('scripts/build.mjs');
  assert.ok(build.indexOf('await pruneRetiredVisuals(root)') < build.indexOf("tsc(['-p'"));
});
