import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionDriver } from '../dist/motion.js';
import { DEFAULTS, silentFrame, sanitizeSettings } from '../dist/settings.js';
import { readFileSync } from 'node:fs';

const options = (extra={}) => ({...DEFAULTS, ...extra});
const frame = (extra={}) => ({...silentFrame(), ...extra});
const music = (energy=.5, extra={}) => frame({volume:energy,bass:energy,mid:energy*.7,treble:energy*.4,spectrum:new Float32Array(128).fill(energy),...extra});
const lanes=['time','clock','travel','turn','flow','colorShift'];
function advance(driver, audio, seconds=3, settings=options(), fps=60) {
  for(let i=0;i<seconds*fps;i++) driver.update(audio,settings,1/fps);
  return {...driver.state};
}

test('all transport phases move forward through attacks, decays, silence and response changes',()=>{
 const d=new MotionDriver();const s=options();let last={...d.state};
 for(let i=0;i<6000;i++){
  const phase=(i%60)/60;
  const energy=i<3600?.8*Math.exp(-phase*9):0;
  s.intensity=i>1800?.1:1.7;s.motion=i>2400?.25:.8;
  const now=d.update(music(energy,{beat:phase===0?.9:0}),s,1/60);
  for(const k of lanes){assert.ok(Number.isFinite(now[k]));assert.ok(now[k]>=last[k],`${k} reversed at ${i}`);}
  last={...now};
 }
 assert.ok(d.state.travel>10);
});
test('a beat adds lasting distance, not a temporary positional offset',()=>{
 const a=new MotionDriver(),b=new MotionDriver(),s=options({idleMotion:false});
 advance(a,music(.4),1,s);advance(b,music(.4),1,s);
 a.update(music(.4,{beat:1}),s,1/60);b.update(music(.4),s,1/60);
 advance(a,music(.4),2,s);advance(b,music(.4),2,s);
 const gap=a.state.travel-b.state.travel;assert.ok(gap>.02);
 advance(a,music(.4),4,s);advance(b,music(.4),4,s);
 assert.ok(a.state.travel-b.state.travel>=gap-.00001);
});
test('louder sustained input creates more forward travel',()=>{
 const low=advance(new MotionDriver(),music(.07),5),high=advance(new MotionDriver(),music(.85),5);
 assert.ok(high.travel>low.travel*1.5);
});
test('intensity control changes acceleration without multiplying or rewinding phase',()=>{
 const low=advance(new MotionDriver(),music(.5),4,options({intensity:0}));
 const high=advance(new MotionDriver(),music(.5),4,options({intensity:2}));
 assert.ok(high.travel>low.travel*2);
 assert.equal(sanitizeSettings({...DEFAULTS,intensity:9}).intensity,3);
 assert.equal(sanitizeSettings({...DEFAULTS,intensity:-1}).intensity,0);
 assert.equal(sanitizeSettings({...DEFAULTS,intensity:NaN}).intensity,DEFAULTS.intensity);
});
test('bass, mids and highs drive different transport lanes',()=>{
 const b=advance(new MotionDriver(),music(.5,{bass:.8,mid:0,treble:0}),4);
 const m=advance(new MotionDriver(),music(.5,{bass:0,mid:.8,treble:0}),4);
 const h=advance(new MotionDriver(),music(.5,{bass:0,mid:0,treble:.8}),4);
 assert.ok(b.travel>m.travel);assert.ok(m.turn>b.turn);assert.ok(m.flow>b.flow);assert.ok(h.colorShift>m.colorShift);
});
test('gentle peaks limits flashes without reducing forward momentum',()=>{
 const a=new MotionDriver(),b=new MotionDriver();
 for(let i=0;i<240;i++){
  const f=music(.4,{beat:i%30===0?1:0});
  a.update(f,options({gentlePeaks:true}),1/60);b.update(f,options({gentlePeaks:false}),1/60);
  assert.equal(a.state.travel,b.state.travel);assert.ok(a.state.beat<=b.state.beat);
 }
});
test('zero flow speed freezes positions and changing it never jumps the phase',()=>{
 const d=new MotionDriver();advance(d,music(.7),2);const before={...d.state};
 advance(d,music(.8),4,options({motion:0}));
 for(const k of lanes)assert.equal(d.state[k],before[k]);
 d.update(music(.5),options({motion:2}),1/120);assert.ok(d.state.travel-before.travel<.15);
});
test('silence and gated noise generate no fabricated beat events',()=>{
 const d=new MotionDriver();for(let i=0;i<1000;i++){
  const s=d.update(frame({volume:.0001,beat:1,bass:1,spectrum:new Float32Array(128).fill(1)}),options(),1/60);
  assert.equal(s.event,false);assert.equal(s.beat,0);assert.equal(s.bass,0);
 }
});
test('a held native beat does not spawn a fresh impulse every rendering frame',()=>{
 const d=new MotionDriver();let events=0;for(let i=0;i<180;i++)events+=Number(d.update(music(.5,{beat:.8}),options(),1/60).event);
 assert.equal(events,1);
});
test('native beat pulses below the old .32 threshold survive',()=>{
 const d=new MotionDriver();advance(d,music(.1),1);
 assert.equal(d.update(music(.1,{beat:.26}),options(),1/60).event,true);
 assert.ok(d.state.eventStrength>=.26);
});
test('spectral onset detector can react without a native beat signal',()=>{
 const d=new MotionDriver();advance(d,silentFrame(),1);
 assert.equal(d.update(music(.7,{beat:0}),options(),1/60).event,true);
});
test('frame rate differences do not materially change integrated travel',()=>{
 const values=[30,60,120].map(fps=>advance(new MotionDriver(),music(.45),8,options(),fps));
 for(const k of ['time','travel','turn','flow','colorShift']){
  const xs=values.map(s=>s[k]);assert.ok((Math.max(...xs)-Math.min(...xs))/Math.max(...xs)<.03,`${k} differs`);
 }
});
test('source changes clear signal history but do not rewind the scene',()=>{
 const d=new MotionDriver();advance(d,music(.6),3);const before={...d.state};d.resetAudio();
 for(const k of lanes)assert.equal(d.state[k],before[k]);
 assert.equal(d.state.bass,0);assert.equal(d.state.beat,0);assert.equal(d.state.event,false);
 d.update(silentFrame(),options(),1/60);assert.ok(d.state.travel>=before.travel);
});
test('invalid packets and frame gaps cannot contaminate the transport with NaN',()=>{
 const d=new MotionDriver(),s=options({intensity:NaN,motion:NaN});
 const f=frame({volume:Infinity,bass:NaN,mid:-5,treble:NaN,beat:NaN,spectrum:new Float32Array(128).fill(NaN)});
 for(const dt of [NaN,Infinity,-.1,0,1e9,1/60])d.update(f,s,dt);
 for(const k of lanes)assert.ok(Number.isFinite(d.state[k]));
 assert.equal(d.state.event,false);
});
test('capture settings from 0.2.1 migrate with the new music-response default',()=>{
 const stored={...DEFAULTS,mode:'both',desktopGain:.6,microphoneGain:.3,visual:'mandelbrot'};delete stored.intensity;delete stored.visualTuningVersion;delete stored.visualTunings;
 const result=sanitizeSettings(stored);assert.equal(result.mode,'both');assert.equal(result.desktopGain,.6);assert.equal(result.microphoneGain,.3);assert.equal(result.visual,'mandelbrot');assert.equal(result.intensity,1);
});
test('there is exactly one working HTML control row and no native decorations requested',()=>{
 const html=readFileSync(new URL('../static/index.html',import.meta.url),'utf8');
 for(const id of ['minimize','fullscreen','close-app'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
 assert.equal((html.match(/class="window-actions"/g)||[]).length,1);
 const config=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8')).app.windows[0];
 assert.equal(config.decorations,false);assert.equal(config.shadow,false);assert.equal(config.transparent,true);assert.equal(Object.hasOwn(config,'noRedirectionBitmap'),false);
});
