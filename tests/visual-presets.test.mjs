import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VISUAL_IDS } from '../dist/catalog.js';
import { DEFAULTS, sanitizeSettings, loadSettings, saveSettings } from '../dist/settings.js';
import { VISUAL_DEFAULTS, VISUAL_TUNING_KEYS, defaultVisualTuning, createVisualTunings, sanitizeVisualTuning, activateVisual, rememberVisualTuning, resetVisualTuning, resetAllVisualTunings, isVisualTuningKey, resolveVisualControls, migrateLegacyTuning, glowStrength, migrateGlow, FIXED_SMOOTHNESS } from '../dist/visual-presets.js';
const fixture = JSON.parse(readFileSync(new URL('fixtures/screenshot-defaults-0.2.11.json', import.meta.url), 'utf8'));
const tuningOf = s => Object.fromEntries(VISUAL_TUNING_KEYS.map(k => [k, s[k]]));
const globalOf = s => Object.fromEntries(Object.entries(s).filter(([k]) => !VISUAL_TUNING_KEYS.includes(k) && !['visual','visualTunings','visualTuningVersion'].includes(k)));

for (const id of VISUAL_IDS) {
  test(id + ': simplified controls retain artist balance and fixed smoothing', () => {
    const tuning = defaultVisualTuning(id), resolved = resolveVisualControls(id, tuning);
    assert.equal(tuning.intensity, 1); assert.equal(tuning.lineWidth, 1); assert.equal(tuning.palette, 'randomize');
    assert.equal(resolved.smoothness, .8);
    const old = fixture.profiles[id];
    if (old) {
      assert.equal(resolved.amplitude, old.intensity); assert.equal(resolved.response, old.reactivity);
      assert.equal(resolved.speed, old.motion); assert.ok(Math.abs(resolved.glow - old.glow) < 1e-8);
    }
    const s = sanitizeSettings(null); activateVisual(s, id);
    assert.deepEqual(tuningOf(s), tuning); assert.deepEqual(s.visualTunings[id], tuning);
  });
}

test('all simplified profiles adopt once on a 0.2.10 installation without resetting global settings', () => {
  for (const id of [...VISUAL_IDS, ...fixture.removed]) {
    const old = { version: 1, audioBehavior: 2, colorBehavior: 1, visual: id,
      intensity: 2.5, reactivity: .1, motion: .05, smoothness: .01, glow: .1, palette: 'ice',
      mode:'both', desktopDevice:'speakers', microphoneDevice:'mic', desktopGain:.8, microphoneGain:1.3,
      quality:'high', fps:30, background:'transparent', opacity:.65, menuPosition:'top-left',
      idleMotion:true, gentlePeaks:false, showSignal:true, hideTaskbar:true, layer:'top' };
    const s = sanitizeSettings(old); const expectedId = VISUAL_IDS.includes(id) ? id : 'soundform';
    assert.equal(s.visual, expectedId);
    assert.deepEqual(tuningOf(s), defaultVisualTuning(expectedId));
    assert.deepEqual(s.visualTunings, createVisualTunings());
    for (const key of ['mode','desktopDevice','microphoneDevice','desktopGain','microphoneGain','quality','fps','background','opacity','menuPosition','idleMotion','gentlePeaks','showSignal','hideTaskbar','layer']) assert.equal(s[key], old[key], key);
    assert.deepEqual(sanitizeSettings(s), s, 'migration is idempotent');
  }
});

test('each preset remembers changes independently, including palette and zero values', () => {
  const s = sanitizeSettings(null);
  for (const [n, id] of VISUAL_IDS.entries()) {
    activateVisual(s, id);
    Object.assign(s, { intensity: .2+n*.1, motion: n*.1, lineWidth: .5, glow: 0, palette: 'ember' });
    rememberVisualTuning(s);
  }
  for (const [n, id] of VISUAL_IDS.entries()) {
    activateVisual(s, id);
    assert.deepEqual(tuningOf(s), { intensity: .2+n*.1, motion: n*.1, lineWidth: .5, glow: 0, zoom: 1, palette: 'ember' });
  }
});

test('navigation snapshots even an unsaved active slider change', () => {
  const s = sanitizeSettings(null); s.intensity = 2.15; s.palette = 'pearl';
  activateVisual(s, 'glass'); assert.deepEqual(tuningOf(s), defaultVisualTuning('glass'));
  activateVisual(s, 'soundform'); assert.equal(s.intensity, 2.15); assert.equal(s.palette, 'pearl');
});

test('selecting the same visual does not reset its custom tuning', () => {
  const s = sanitizeSettings(null); s.intensity=2.4; activateVisual(s, 'soundform'); assert.equal(s.intensity,2.4);
  const before=structuredClone(s); activateVisual(s, 'julia'); assert.deepEqual(s,before);
});

test('reset restores every tuning field only for the active effect', () => {
  const s = sanitizeSettings({ ...DEFAULTS, mode:'both', desktopDevice:'custom', idleMotion:true, quality:'high', favorites:['lava'] });
  s.glow=.9; s.motion=1.7; rememberVisualTuning(s);
  activateVisual(s,'glass'); s.glow=0; s.motion=0; s.intensity=.3; s.palette='ice';
  const others=structuredClone(s.visualTunings), globals=globalOf(s);
  resetVisualTuning(s);
  assert.deepEqual(tuningOf(s),defaultVisualTuning('glass'));
  for(const id of VISUAL_IDS.filter(x=>x!=='glass')) assert.deepEqual(s.visualTunings[id],others[id]);
  assert.deepEqual(globalOf(s),globals);
});

test('explicit reset all restores every profile and selects Soundform', () => {
  const s=sanitizeSettings(null);activateVisual(s,'lava');s.palette='ice';s.motion=2;rememberVisualTuning(s);
  resetAllVisualTunings(s);
  assert.equal(s.visual,'soundform');assert.deepEqual(s.visualTunings,createVisualTunings());assert.deepEqual(tuningOf(s),defaultVisualTuning('soundform'));
});

test('map copies and preset defaults never share mutable child settings', () => {
  const baseline=structuredClone(DEFAULTS);
  const a=sanitizeSettings(null),b=sanitizeSettings(null);a.visualTunings.glass.glow=0;
  assert.equal(b.visualTunings.glass.glow,defaultVisualTuning('glass').glow);assert.deepEqual(DEFAULTS,baseline);
  const c={...DEFAULTS};c.intensity=.45;rememberVisualTuning(c);activateVisual(c,'glass');resetVisualTuning(c);
  assert.deepEqual(DEFAULTS,baseline);
  assert.ok(Object.isFrozen(VISUAL_DEFAULTS));for(const id of VISUAL_IDS)assert.ok(Object.isFrozen(VISUAL_DEFAULTS[id]));
});

test('preset schema clamps safely and ignores malformed numbers, colors and unknown keys', () => {
  const p=sanitizeVisualTuning('glass',{intensity:999,lineWidth:-1,motion:Infinity,glow:0,palette:'bad',malicious:1});
  assert.deepEqual(p,{intensity:3,lineWidth:.35,motion:.6,glow:0,zoom:1,palette:'randomize'});
  for(const x of [null,[],true,10,'bad'])assert.deepEqual(sanitizeVisualTuning('lava',x),defaultVisualTuning('lava'));
  assert.equal(isVisualTuningKey('glow'),true);assert.equal(isVisualTuningKey('quality'),false);
});

test('malformed profile maps are reconstructed and unknown/removed IDs cannot persist', () => {
  for(const profiles of [null,[],false,'bad',{'julia':{intensity:2},'lava':{glow:NaN},'glass':{motion:0}}]) {
    const s=sanitizeSettings({...DEFAULTS,visualTunings:profiles});
    assert.deepEqual(Object.keys(s.visualTunings),VISUAL_IDS);assert.ok(!Object.hasOwn(s.visualTunings,'julia'));
    for(const id of VISUAL_IDS)for(const key of ['intensity','lineWidth','motion','glow'])assert.ok(Number.isFinite(s.visualTunings[id][key]));
  }
});

test('retired active effect does not overwrite a previously customized Soundform profile', () => {
  const s=sanitizeSettings(null);s.intensity=2.15;rememberVisualTuning(s);
  const next=sanitizeSettings({...s,visual:'starflight',intensity:.1,glow:.99});
  assert.equal(next.visual,'soundform');assert.equal(next.intensity,2.15);assert.equal(next.glow,defaultVisualTuning('soundform').glow);
});

test('save/reload preserves independent edits and stops the one-time adoption from repeating', () => {
  const map=new Map();globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  try{
    const s=loadSettings();s.glow=.1;activateVisual(s,'glass');s.motion=1.25;s.palette='pearl';
    assert.ok(saveSettings(s));const next=loadSettings();assert.equal(next.visual,'glass');assert.equal(next.motion,1.25);assert.equal(next.palette,'pearl');
    activateVisual(next,'soundform');assert.equal(next.glow,.1);activateVisual(next,'glass');assert.equal(next.motion,1.25);
    assert.equal(next.visualTuningVersion,2);assert.equal(map.size,1);
  }finally{delete globalThis.localStorage;}
});

test('one local backup preserves the original shared settings without being overwritten later', () => {
  const raw=JSON.stringify({version:1,visual:'glass',intensity:.25,motion:1.9,quality:'high'});
  const map=new Map([['vsualize.settings.v1',raw]]);globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  try{
    const s=loadSettings();assert.equal(map.get('vsualize.settings.before-simple-controls.v2'),raw);
    assert.equal(s.intensity,1);saveSettings(s);loadSettings();assert.equal(map.get('vsualize.settings.before-simple-controls.v2'),raw);
  }finally{delete globalThis.localStorage;}
});

test('optional backup storage failure does not erase usable source choices', () => {
  globalThis.localStorage={getItem:k=>k==='vsualize.settings.v1'?JSON.stringify({visual:'lava',mode:'both',desktopDevice:'test'}):null,setItem(){throw Error('full');}};
  try{const s=loadSettings();assert.equal(s.visual,'lava');assert.equal(s.mode,'both');assert.equal(s.desktopDevice,'test');assert.equal(s.motion,.2);}
  finally{delete globalThis.localStorage;}
});

test('all UI navigation and resets call the per-effect settings helpers', () => {
  const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  assert.match(main,/activateVisual\(settings, id\)/);assert.match(main,/activateVisual\(settings, query\.get/);
  assert.match(main,/if \(isVisualTuningKey\(key\)\) rememberVisualTuning\(settings\)/);
  assert.match(main,/settings\.palette = id; rememberVisualTuning\(settings\)/);
  assert.match(main,/resetVisualTuning\(settings\)/);assert.match(main,/resetAllVisualTunings\(settings\)/);
});

test('legacy artist profiles migrate combined drive and glow exactly once', () => {
  const legacy = { visualTuningVersion: 1, colorBehavior: 1, visual: 'glass',
    visualTunings: { glass: { intensity: 1.4, reactivity: .7, motion: 0, glow: .9, palette: 'ice' },
      lava: { intensity: 1.2, reactivity: 1.1, motion: .4, glow: 0, palette: 'ember' } } };
  const migrated = sanitizeSettings(legacy), controls = resolveVisualControls('glass', migrated);
  assert.ok(Math.abs(controls.amplitude * controls.response - 1.4 * .7) < 1e-8);
  assert.ok(Math.abs(controls.glow - .9) < 1e-8);
  assert.equal(migrated.motion, 0); assert.equal(migrated.palette, 'ice');
  assert.equal(migrated.visualTunings.lava.glow, 0); assert.equal(migrated.visualTuningVersion, 2);
  assert.ok(!('smoothness' in migrated)); assert.ok(!('reactivity' in migrated));
  assert.deepEqual(sanitizeSettings(migrated), migrated);
});

test('zero intensity removes musical deformation, maximum controls remain bounded', () => {
  for (const id of VISUAL_IDS) {
    const low = resolveVisualControls(id, {...defaultVisualTuning(id), intensity: 0});
    assert.equal(low.amplitude, 0); assert.equal(low.response, 0); assert.equal(low.smoothness, FIXED_SMOOTHNESS);
    const high = resolveVisualControls(id, {...defaultVisualTuning(id), intensity: Infinity, lineWidth: NaN, motion: Infinity});
    for (const value of Object.values(high)) assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(glowStrength(migrateGlow(1)) - 1) < 1e-8);
  }
  assert.equal(glowStrength(1), 4); assert.equal(migrateGlow(0), 0);
  assert.deepEqual(migrateLegacyTuning('glass', null), defaultVisualTuning('glass'));
});
