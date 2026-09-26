import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DampedValue, VisualInertia, ImpulseHistory, IMPULSE_COUNT, IMPULSE_LIFETIME } from '../dist/inertia.js';
import { MotionDriver } from '../dist/motion.js';
import { DEFAULTS, silentFrame, sanitizeSettings } from '../dist/settings.js';
import { resolveVisualControls, FIXED_SMOOTHNESS } from '../dist/visual-presets.js';
const sample=(extra={})=>({...silentFrame(),volume:.5,bass:.5,mid:.3,treble:.2,...extra});
const source=name=>readFileSync(new URL(`../src/visuals/${name}.ts`,import.meta.url),'utf8');
test('critically damped shape movement never overshoots either target',()=>{
 const f=new DampedValue();let previous=0;
 for(let i=0;i<200;i++){const next=f.update(1,1/60,.4);assert.ok(next>=previous&&next<=1);previous=next;}
 for(let i=0;i<200;i++){const next=f.update(0,1/60,.4);assert.ok(next<=previous&&next>=0);previous=next;}
});
test('damping uses elapsed seconds and agrees at 30, 60 and 120 fps',()=>{
 const results=[30,60,120].map(fps=>{const f=new DampedValue();for(let i=0;i<fps*.6;i++)f.update(1,1/fps,.4);return f.value;});
 assert.ok(Math.max(...results)-Math.min(...results)<1e-10);
});
test('a source step cannot instantly relocate geometry',()=>{
 const f=new DampedValue();assert.ok(f.update(1,1/60,.4)<.01);
});
test('damping preserves sustained band magnitude instead of flattening music',()=>{
 const driver=new MotionDriver(),v=new VisualInertia();
 for(let i=0;i<300;i++)v.update({...driver.state,bass:.8,mid:.35,treble:.1},new Float32Array(128).fill(.65),1/60);
 assert.ok(Math.abs(v.value.bass-.8)<.001);assert.ok(Math.abs(v.value.mid-.35)<.001);assert.ok(v.value.treble<.101);
 assert.ok(v.spectrum.every(x=>Math.abs(x-.65)<.001));
});
test('fast attacks still bound alternating packet jumps and leave input meters unchanged',()=>{
 const s=new MotionDriver().state,v=new VisualInertia(),input=new Float32Array(128);
 let last=0,largest=0;
 for(let i=0;i<240;i++){
  const band=i%4<2?.9:.1;input.fill(band);
  const original={...s,bass:band};v.update(original,input,1/120);
  largest=Math.max(largest,Math.abs(v.value.bass-last));last=v.value.bass;
  assert.equal(original.bass,band);
 }
 assert.ok(largest<.15,`band step ${largest}; raw jumps are .8`);
});
test('more smoothing softens attacks while retaining a prompt response',()=>{
 const a=new VisualInertia(),b=new VisualInertia(),s={...new MotionDriver().state,bass:1};
 for(let i=0;i<6;i++){a.update(s,new Float32Array(128),1/60,0);b.update(s,new Float32Array(128),1/60,1);}
 assert.ok(b.value.bass<a.value.bass); assert.ok(b.value.bass>.85);
});
test('bands and spectral geometry pass half height within 50ms while release stays smooth',()=>{
 for (const fps of [30,60,120]) {
  const v=new VisualInertia(),state={...new MotionDriver().state,bass:1,mid:1,treble:1,impact:1};
  const input=new Float32Array(128).fill(1);
  for(let i=0;i<Math.ceil(fps*.05);i++)v.update(state,input,1/fps,FIXED_SMOOTHNESS);
  assert.ok(v.value.bass>.5,`bass at ${fps}fps`);assert.ok(v.spectrum[64]>.5,`spectrum at ${fps}fps`);
  for(let i=0;i<fps;i++)v.update(state,input,1/fps,FIXED_SMOOTHNESS);
  for(let i=0;i<Math.ceil(fps*.05);i++)v.update({...state,bass:0},input,1/fps,FIXED_SMOOTHNESS);
  assert.ok(v.value.bass>.85,`release at ${fps}fps`);
 }
});
test('invalid values or frame gaps cannot create NaN in shape state',()=>{
 const a=new VisualInertia(),s={...new MotionDriver().state,bass:NaN,mid:Infinity,volume:-5};
 for(const dt of [NaN,Infinity,-2,0,.1,100])a.update(s,new Float32Array(128).fill(NaN),dt,NaN);
 assert.ok(Object.values(a.value).every(Number.isFinite));assert.ok(a.spectrum.every(Number.isFinite));
});
test('smoothing reset clears deformation but does not own or reset the camera',()=>{
 const d=new MotionDriver(),v=new VisualInertia();for(let i=0;i<60;i++)v.update(d.update(sample(),DEFAULTS,1/60),d.response.value.spectrum,1/60);
 const distance=d.state.travel;v.reset();assert.equal(v.value.bass,0);assert.equal(d.state.travel,distance);
});
test('r5 fixes smoothing while preserving sources, gain and retained favorites',()=>{
 const old={...DEFAULTS,visual:'mandelbrot',mode:'both',desktopGain:.8,palette:'ember',favorites:['soundform'],smoothness:5};
 const next=sanitizeSettings(old);assert.equal(resolveVisualControls(next.visual,next).smoothness,.8);assert.equal(next.mode,'both');assert.equal(next.desktopGain,.8);assert.equal(next.visual,'mandelbrot');assert.deepEqual(next.favorites,['soundform']);
 assert.equal('smoothness' in next,false);
});
test('every event slot retains its original position and strength while alive',()=>{
 const h=new ImpulseHistory();let now=0;
 for(let i=0;i<IMPULSE_COUNT;i++){assert.ok(h.push(now,.5));now+=.14;}
 const before=[...h.data];assert.equal(h.push(now,1),false);assert.deepEqual([...h.data],before);
 assert.equal(h.push(IMPULSE_LIFETIME+.01,.8),true);assert.equal(h.data[1]>.79,true);
});
test('invalid or too-close attacks cannot consume ring slots',()=>{
 const h=new ImpulseHistory();assert.equal(h.push(NaN,1),false);assert.equal(h.push(0,0),false);assert.ok(h.push(0,.7));assert.equal(h.push(.02,.8),false);
});
test('shared shaders match the sized impulse buffer and fade old events before reuse',()=>{
 const common=source('common');assert.match(common,/uImpulses\[24\]/);assert.equal(IMPULSE_COUNT,24);
 assert.match(common,/smoothstep\(3.5,4.8,age\)/);assert.equal(IMPULSE_LIFETIME,4.8);
});
test('retained fractal flight helper keeps coordinates free of audio-dependent scale or roll',()=>{
 const flight=source('fractal-flight');
 assert.match(flight,/exp\(-depth\)/);assert.doesNotMatch(flight,/rot\(uTurn/);
 const coordinate=flight.match(/vec2 z=.*;/)[0];assert.doesNotMatch(coordinate,/uBass|uMid|uTreble|uImpact|uTurn/);
});
test('raw PCM phase no longer distorts surface or tunnel coordinates',()=>{
 for(const name of ['glass','groove','spectrum','mandelbrot','kaleidoscope'])assert.doesNotMatch(source(name),/\bwave\(/,name);
});
test('log-depth passages now move outward toward the viewer',()=>{
 assert.match(source('dissolution'),/depth\*4\.2\+uTravel/);
});
test('soundform samples delayed spectral fields rather than translating a flat disc',()=>{
 const code=source('soundform');assert.match(code,/soundFieldRGBA/);assert.match(code,/projected=z\*0\.40\+h/);assert.doesNotMatch(code,/perspective=clamp/);
});
test('compiler script invokes Node directly without Windows shell concatenation',()=>{
 const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(build,/spawnSync\(process\.execPath/);assert.match(build,/shell: false/);assert.doesNotMatch(build,/tsc\.cmd/);
});
