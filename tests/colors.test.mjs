import test from 'node:test';
import assert from 'node:assert/strict';
import { ColorCycle, PALETTE_SECONDS_MIN, PALETTE_SECONDS_MAX } from '../dist/colors.js';
import { DEFAULTS, PALETTES, PALETTE_ORDER, sanitizeSettings, loadSettings, saveSettings, demoFrame, silentFrame, hexRGB } from '../dist/settings.js';
import { VISUAL_IDS } from '../dist/catalog.js';
import { VISUALS } from '../dist/visuals/index.js';
import { Renderer } from '../dist/renderer.js';

const snapshot = values => values.map(v => [...v]);
const maxDifference = (a, b) => Math.max(...a.flat().map((v, i) => Math.abs(v - b.flat()[i])));

test('Randomize is the first and default color option; all fixed palettes remain', () => {
  assert.equal(DEFAULTS.palette, 'randomize');
  assert.equal(DEFAULTS.colorBehavior, 1);
  assert.deepEqual(PALETTE_ORDER, ['randomize', ...Object.keys(PALETTES)]);
  assert.equal(new Set(PALETTE_ORDER).size, 8);
  assert.deepEqual(sanitizeSettings(null), DEFAULTS);
  assert.equal(sanitizeSettings({ ...DEFAULTS, palette: 'not-a-palette' }).palette, 'randomize');
});

test('existing color choices adopt Randomize once without disturbing anything else', () => {
  for (const palette of ['auto', ...Object.keys(PALETTES)]) {
    const old = sanitizeSettings({ ...DEFAULTS, palette, visual: 'mandelbrot', favorites: ['mandelbrot', 'soundform'],
      background: 'transparent', opacity: .62, mode: 'both', desktopDevice: 'speaker',
      microphoneDevice: 'mic', sensitivity: 2.1, lineWidth: .86, motion: .43 });
    delete old.colorBehavior;
    const expected = structuredClone(old); expected.palette = 'randomize'; expected.colorBehavior = 1; expected.visualTunings.mandelbrot.palette = 'randomize';
    assert.deepEqual(sanitizeSettings(old), expected);
  }
});

test('manual color selections after migration persist across save/reload', () => {
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  try {
    for (const palette of PALETTE_ORDER) {
      assert.ok(saveSettings({ ...DEFAULTS, palette }));
      assert.equal(loadSettings().palette, palette);
      assert.equal(loadSettings().colorBehavior, 1);
    }
  } finally { delete globalThis.localStorage; }
});

function hsv(rgb) {
  const max = Math.max(...rgb), min = Math.min(...rgb), d = max - min;
  let hue = d === 0 ? 0 : max === rgb[0] ? ((rgb[1]-rgb[2])/d+6)%6 : max === rgb[1] ? (rgb[2]-rgb[0])/d+2 : (rgb[0]-rgb[1])/d+4;
  return [hue/6, max > 0 ? d/max : 0, max];
}
function separation(a, b) { const d = Math.abs(a-b); return Math.min(d,1-d); }
function advanceSeconds(cycle, seconds, fps=60) { for(let n=0;n<Math.round(seconds*fps);n++) cycle.advance(1/fps); return snapshot(cycle.advance(0)); }

test('each generated palette has five simultaneously distinct, saturated hues', () => {
  for (let seed=0;seed<120;seed++) {
    const cycle = new ColorCycle(seed/120);
    for (let sample=0;sample<18;sample++) {
      const colors=advanceSeconds(cycle, 1.5, 30);
      assert.equal(colors.length,5);
      const values=colors.map(hsv);
      for(let i=0;i<5;i++) {
        assert.ok(values[i][1]>=.619 && values[i][2]>=.779);
        for(let j=i+1;j<5;j++) assert.ok(separation(values[i][0],values[j][0])>.045, `${seed}/${sample}: collapsed hues`);
      }
    }
  }
});

test('destinations change color relationships, saturation and lightness, not just a common hue', () => {
  const cycle=new ColorCycle(.341), a=snapshot(cycle.advance(0)).map(hsv);
  const b=advanceSeconds(cycle,25).map(hsv);
  const spacing=colors=>colors.slice(1).map(c=>separation(c[0],colors[0][0]));
  assert.ok(Math.max(...spacing(a).map((v,i)=>Math.abs(v-spacing(b)[i])))>.025);
  assert.ok(Math.max(...a.map((v,i)=>Math.abs(v[1]-b[i][1])))>.025);
  assert.ok(Math.max(...a.map((v,i)=>Math.abs(v[2]-b[i][2])))>.025);
  assert.ok(cycle.generatedPalettes>=4);
});

test('palettes continue to be generated rather than repeating after one minute', () => {
  const cycle=new ColorCycle(.42), a=snapshot(cycle.advance(0));
  const b=advanceSeconds(cycle,60), c=advanceSeconds(cycle,60);
  assert.ok(maxDifference(a,b)>.1); assert.ok(maxDifference(b,c)>.1);
  const sequence = new Set();
  for(let i=0;i<60;i++) sequence.add(advanceSeconds(cycle,10,30).flat().map(v=>v.toFixed(3)).join(','));
  assert.equal(sequence.size,60);
  assert.ok(cycle.generatedPalettes>60);
  assert.equal(PALETTE_SECONDS_MIN,7); assert.equal(PALETTE_SECONDS_MAX,12);
});

test('all transition boundaries are continuous and RGB stays bounded during ten minutes', () => {
  const cycle=new ColorCycle(.998); let previous=snapshot(cycle.advance(0)), largest=0;
  for(let i=0;i<600*60;i++) {
    const current=cycle.advance(1/60);
    largest=Math.max(largest,maxDifference(current,previous));
    assert.ok(current.flat().every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    previous=snapshot(current);
  }
  assert.ok(largest>0 && largest<.025, `largest 60-FPS channel step ${largest}`);
});

test('30, 60 and 120 FPS reach the same generated palette and flow after equal active time', () => {
  const samples=[30,60,120].map(fps=>{const cycle=new ColorCycle(.34);return {colors:advanceSeconds(cycle,120,fps),phase:cycle.phase,count:cycle.generatedPalettes};});
  assert.ok(maxDifference(samples[0].colors,samples[1].colors)<1e-8);
  assert.ok(maxDifference(samples[0].colors,samples[2].colors)<1e-8);
  assert.ok(Math.abs(samples[0].phase-samples[2].phase)<1e-8);
  assert.equal(samples[0].count,samples[2].count);
});

test('invalid deltas and suspended frames cannot skip to a distant destination', () => {
  const cycle=new ColorCycle(.2); advanceSeconds(cycle,3);
  const before=snapshot(cycle.advance(0)), phase=cycle.phase;
  for(const value of [0,-1,NaN,Infinity,-Infinity]) assert.deepEqual(cycle.advance(value),before);
  assert.equal(cycle.phase,phase);
  assert.ok(maxDifference(before,cycle.advance(3600))<.12);
  for(const seed of [NaN,Infinity,-2.4,10.9]) assert.ok(new ColorCycle(seed).advance(.01).flat().every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});

test('session randomness seeds once; later destinations are deterministic and tuples reused', () => {
  const original=Math.random;let calls=0;
  Math.random=()=>{calls++;return .75;};
  try {
    const cycle=new ColorCycle(), colors=cycle.advance(0), tuples=[...colors];
    advanceSeconds(cycle,35);assert.equal(calls,1);
    assert.equal(cycle.advance(0),colors);
    assert.deepEqual(cycle.advance(0).map((v,i)=>v===tuples[i]),[true,true,true,true,true]);
    const reference=new ColorCycle(.75);advanceSeconds(reference,35);
    assert.deepEqual(cycle.advance(0),reference.advance(0));
    assert.ok(cycle.generatedPalettes>=4);
  } finally {Math.random=original;}
});

// This integration exercises the real Renderer and transport, but records GL
// calls instead of drawing pixels. The companion EGL test checks real shaders.
function recordingRenderer() {
  const uniforms = new Map(); let draws = 0; let allocations = 0;
  const gl = new Proxy({}, { get: (_, key) => {
    if (/^[A-Z0-9_]+$/.test(String(key))) return key;
    if (key === 'getParameter') return p => p === 'MAX_VIEWPORT_DIMS' ? new Int32Array([16384,16384]) : 16384;
    if (key === 'drawingBufferWidth') return canvas.width;
    if (key === 'drawingBufferHeight') return canvas.height;
    if (key === 'getUniformLocation') return (_p, name) => name;
    if (key === 'uniform3fv') return (name, values) => uniforms.set(name, [...values]);
    if (key === 'uniform1f') return (name, value) => uniforms.set(name, value);
    if (key === 'drawArrays') return () => { draws++; };
    if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
    if (key === 'checkFramebufferStatus') return () => 'FRAMEBUFFER_COMPLETE';
    if (key === 'createFramebuffer') return () => { allocations++; return {}; };
    if (String(key).startsWith('create')) return () => ({});
    return () => {};
  }});
  const canvas = { clientWidth: 420, clientHeight: 420, width: 420, height: 420,
    getBoundingClientRect() { return {width:this.clientWidth,height:this.clientHeight}; },
    addEventListener() {}, getContext: () => gl };
  const errors = [];
  globalThis.window = { devicePixelRatio: 1 };
  // Reproducible test seed. Production still starts each session randomly.
  const random = Math.random;
  let renderer;
  try { Math.random = () => .217; renderer = new Renderer(canvas, message => errors.push(message)); }
  finally { Math.random = random; }
  const colors = () => ['uColorA','uColorD','uColorB','uColorE','uColorC'].map(name => uniforms.get(name));
  return { renderer, uniforms, colors, errors, draws: () => draws, allocations: () => allocations };
}

test('all 11 effects receive the cycling palette, including effects with a rainbow default', () => {
  const recording = recordingRenderer();
  const { renderer, colors, uniforms, errors } = recording;
  try {
    for (let n=0;n<180;n++) renderer.render(demoFrame(3), {...DEFAULTS,idleMotion:true},1/60);
    for (const visual of VISUAL_IDS) {
      const settings = { ...DEFAULTS, visual, idleMotion: true };
      renderer.render(demoFrame(3), settings, 1/60);
      const before = snapshot(colors()), phaseBefore = uniforms.get('uPalettePhase');
      for (let n = 0; n < 90; n++) renderer.render(demoFrame(3), settings, 1/60);
      // Quintic palette transitions intentionally slow near their endpoints;
      // the separate spatial phase still moves color across layers there.
      assert.ok(maxDifference(before, colors()) > .0001 || Math.abs(uniforms.get('uPalettePhase')-phaseBefore) > .001, visual);
      assert.equal(uniforms.get('uRainbow'), 0, visual + ' must not bypass the cycling palette');
      assert.equal(uniforms.get('uMulticolor'),1);
      assert.deepEqual(colors(),renderer.palettePreview);
    }
    assert.deepEqual(errors, []);
  } finally { renderer.destroy(); delete globalThis.window; }
});

test('fixed and Visual default color uniforms are identical to the previous implementation', () => {
  const { renderer, colors, uniforms, errors } = recordingRenderer();
  try {
    for (const visual of VISUAL_IDS) for (const palette of ['auto', ...Object.keys(PALETTES)]) {
      renderer.render(demoFrame(2), { ...DEFAULTS, visual, palette }, 1/60);
      const id = palette === 'auto' ? VISUALS[visual].palette : palette;
      assert.deepEqual(['uColorA','uColorB','uColorC'].map(n=>uniforms.get(n)), PALETTES[id].colors.map(hexRGB), `${visual}/${palette}`);
      assert.equal(uniforms.get('uRainbow'), id === 'spectrum' ? 1 : 0);
      assert.equal(uniforms.get('uMulticolor'),0);
      assert.equal(uniforms.get('uPalettePhase'),0);
    }
    assert.deepEqual(errors, []);
  } finally { renderer.destroy(); delete globalThis.window; }
});

test('pause, silence and preset switching preserve color phase, with no false musical motion', () => {
  const { renderer, colors, errors } = recordingRenderer();
  try {
    const settings = { ...DEFAULTS, idleMotion: true };
    renderer.render(demoFrame(2), settings, 1/60);
    const initial = snapshot(colors());
    renderer.paused = true;
    for (let i = 0; i < 120; i++) renderer.render(demoFrame(2), settings, 1/60);
    assert.deepEqual(colors(), initial);
    renderer.paused = false;
    renderer.render(demoFrame(2), { ...settings, visual: 'mandelbrot' }, 0);
    assert.deepEqual(colors(), initial, 'switching visuals does not reset the color phase');
    renderer.render(demoFrame(2), { ...settings, palette: 'ember' }, 0);
    renderer.render(demoFrame(2), settings, 0);
    assert.deepEqual(colors(), initial, 'reselecting Randomize resumes instead of reseeding');
    for (let n = 0; n < 20 * 60; n++) renderer.render(silentFrame(), DEFAULTS, 1/60);
    const quiet = snapshot(colors());
    for (let n = 0; n < 120; n++) renderer.render(silentFrame(), DEFAULTS, 1/60);
    assert.deepEqual(colors(), quiet, 'music-only silence freezes palette with the scene');
    renderer.render(demoFrame(3), DEFAULTS, 1/60);
    assert.ok(maxDifference(colors(), quiet) < .025, 'resume has no large color jump');
    assert.deepEqual(errors, []);
  } finally { renderer.destroy(); delete globalThis.window; }
});

test('cycling does not clear the feedback trails each frame', () => {
  const r = recordingRenderer();
  try {
    const settings = { ...DEFAULTS, visual: 'groove', idleMotion: true };
    r.renderer.render(demoFrame(3), settings, 1/60);
    const allocated = r.allocations();
    for (let n = 0; n < 300; n++) r.renderer.render(demoFrame(3), settings, 1/60);
    assert.equal(r.allocations(), allocated);
    assert.equal(allocated, 2);
    assert.equal(r.draws(), 301);
    assert.deepEqual(r.errors, []);
  } finally { r.renderer.destroy(); delete globalThis.window; }
});
