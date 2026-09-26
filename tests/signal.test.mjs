import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, silentFrame, sanitizeSettings, startupMode } from '../dist/settings.js';
import { describeSignal, cleanFrame, rawMeterValue, formatRawLevel } from '../dist/signal.js';
import { MotionDriver } from '../dist/motion.js';
const health = (rawRms, extra={}) => ({ rawRms, packets:42, packetAgeMs:0, sampleRate:48000, channels:2, gated:false,...extra });
const quiet = () => ({ ...silentFrame(), desktopStatus:'Listening: Speakers', microphoneStatus:'Not selected',desktopInput:health(0) });
const loud = () => ({ ...quiet(),volume:.6,bass:.5,mid:.4,treble:.2,beat:.8,spectrum:Array(128).fill(.5),waveform:Array(256).fill(.2),desktopLevel:.6,desktopInput:health(.12) });

test('desktop uses live sources, never a saved demo session; preview starts disconnected',()=>{
 assert.equal(startupMode('demo',true),'desktop'); assert.equal(startupMode('both',true),'both');
 assert.equal(startupMode('microphone',true),'microphone'); assert.equal(startupMode('off',true),'off');
 for(const mode of ['demo','desktop','both','microphone','off']) assert.equal(startupMode(mode,false),'off');
});
test('0.2.2 settings migrate once while preserving custom sources and visuals',()=>{
 const old={...DEFAULTS,visualTuningVersion:undefined,audioBehavior:undefined,idleMotion:true,reactivity:1.25,visual:'mandelbrot',mode:'both',desktopGain:.7};
 const changed=sanitizeSettings(old);assert.equal(changed.idleMotion,false);assert.equal(changed.intensity,1);
 assert.equal(changed.mode,'both');assert.equal(changed.visual,'mandelbrot');assert.equal(changed.desktopGain,.7);
 changed.idleMotion=true;assert.equal(sanitizeSettings(changed).idleMotion,true);
 assert.equal(sanitizeSettings({...changed,intensity:1.9}).intensity,1.9);
});
test('an open endpoint with silence is QUIET, never LIVE',()=>{
 const s=describeSignal(DEFAULTS,quiet());assert.equal(s.kind,'quiet');assert.equal(s.live,false);
 assert.equal(describeSignal(DEFAULTS,loud()).kind,'live');
});
test('demo never claims to be live even when its energy is nonzero',()=>{
 const s=describeSignal({...DEFAULTS,mode:'demo'},loud());assert.equal(s.kind,'demo');assert.equal(s.live,false);assert.match(s.title,/not your music/);
});
test('capture failures and partially failed combined sources have distinct states',()=>{
 assert.equal(describeSignal(DEFAULTS,loud(),'engine failed').kind,'error');
 const f=loud();f.microphoneStatus='Error: unplugged';
 assert.equal(describeSignal({...DEFAULTS,mode:'both'},f).kind,'partial');
 assert.equal(describeSignal({...DEFAULTS,mode:'both'},{...f,volume:0}).kind,'error');
 // Unselected input status must not turn desktop-only capture into an error.
 assert.equal(describeSignal(DEFAULTS,f).kind,'live');
});
test('diagnostics distinguish gated input from zero gain',()=>{
 const f=quiet();f.desktopInput=health(.001,{gated:true});
 assert.equal(describeSignal(DEFAULTS,f).kind,'gated');assert.match(describeSignal(DEFAULTS,f).title,/threshold/);
 f.desktopInput=health(.1);assert.match(describeSignal({...DEFAULTS,desktopGain:0},f).title,/zero/);
});
test('raw dBFS meters are zero in silence and finite for usable input',()=>{
 assert.equal(formatRawLevel(undefined),'No samples');assert.equal(rawMeterValue(health(0)),0);
 assert.equal(formatRawLevel(health(.1)),'-20.0 dBFS');
 assert.equal(formatRawLevel(health(0)),'Silence');assert.ok(rawMeterValue(health(.1))>0);
});
test('native packet shape checks and numeric sanitation reject malformed data',()=>{
 for(const x of [undefined,null,{}, {...loud(),spectrum:[1]}])assert.equal(cleanFrame(x),null);
 const f=loud(); f.volume=NaN;f.bass=Infinity;f.waveform[0]=-3;f.spectrum[0]=NaN;
 const result=cleanFrame(f);assert.equal(result.volume,0);assert.equal(result.bass,0);assert.equal(result.waveform[0],-1);assert.equal(result.spectrum[0],0);
 assert.equal(result.desktopInput.packets,42);
});
test('music-only mode settles fully and never rewinds; resumes on new music',()=>{
 const d=new MotionDriver();for(let i=0;i<180;i++)d.update(loud(),DEFAULTS,1/60);
 const peak=d.state.travel;for(let i=0;i<120;i++)d.update(quiet(),DEFAULTS,1/60);
 assert.equal(d.state.sleeping,true);assert.ok(d.state.travel>=peak);
 const before={...d.state};for(let i=0;i<600;i++)d.update(quiet(),DEFAULTS,1/60);
 for(const key of ['time','clock','turn','flow','travel','colorShift'])assert.equal(d.state[key],before[key]);
 assert.equal(d.state.accent,0);d.update(loud(),DEFAULTS,1/60);assert.equal(d.state.sleeping,false);assert.ok(d.state.travel>before.travel);
});
test('ambient drift remains opt-in and does not create fake audio energy',()=>{
 const d=new MotionDriver();for(let i=0;i<120;i++)d.update(quiet(),{...DEFAULTS,idleMotion:true},1/60);
 assert.equal(d.state.sleeping,false);assert.ok(d.state.time>0);assert.equal(d.state.volume,0);assert.equal(d.state.beat,0);
});
