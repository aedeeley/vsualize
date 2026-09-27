import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, silentFrame } from '../dist/settings.js';
const calls=[]; let channels=[];let failStop=false;let failStart=false;
globalThis.window={__TAURI__:{core:{Channel:class {constructor(){channels.push(this)}},async invoke(command,args){
 calls.push({command,args});
 if(command==='stop_audio'&&failStop)throw Error('Stop failed');
 if(command==='start_audio'&&failStart)throw Error('Device unavailable');
}}}};
const { AudioEngine }=await import('../dist/audio.js');
const music=()=>({...silentFrame(),volume:.6,bass:.5,desktopLevel:.6,spectrum:Array(128).fill(.5),waveform:Array(256).fill(.3),desktopStatus:'Listening: Speakers'});

test('native start uses selected capture; valid channel frames drive analyzer state',async()=>{
 const a=new AudioEngine();await a.start(DEFAULTS);channels.at(-1).onmessage(music());
 assert.equal(a.frame.volume,.6);assert.equal(a.mode,'desktop');assert.equal(a.error,'');
 await a.destroy();
});
test('capture failure is explicit and never falls back to synthetic animation',async()=>{
 const a=new AudioEngine();failStart=true;await a.start(DEFAULTS);failStart=false;
 assert.match(a.error,/unavailable/);assert.equal(a.mode,'desktop');assert.equal(a.tick(performance.now(),.016).volume,0);await a.destroy();
});
test('stop failure is handled, not an unhandled start rejection',async()=>{
 const a=new AudioEngine();failStop=true;await a.start(DEFAULTS);failStop=false;
 assert.match(a.error,/Stop failed/);assert.equal(a.frame.volume,0);await a.destroy();
});
test('rapid source changes serialize and cannot let an old channel win',async()=>{
 const a=new AudioEngine();await a.start(DEFAULTS);const old=channels.at(-1);
 const first=a.start({...DEFAULTS,mode:'microphone'});const last=a.start({...DEFAULTS,mode:'both'});
 await Promise.all([first,last]);old.onmessage(music());assert.equal(a.frame.volume,0);
 channels.at(-1).onmessage({...music(),volume:.3});assert.equal(a.frame.volume,.3);assert.equal(a.mode,'both');await a.destroy();
});
test('transport timeout clears waveform and per-source meters, then accepts recovered frames',async()=>{
 const a=new AudioEngine();await a.start(DEFAULTS);channels.at(-1).onmessage(music());
 const f=a.tick(performance.now()+4000,.05);assert.equal(f.volume,0);assert.equal(f.desktopLevel,0);assert.ok(f.waveform.every(x=>x===0));assert.match(a.error,/not responding/);
 channels.at(-1).onmessage(music());assert.equal(a.error,'');assert.equal(a.frame.volume,.6);await a.destroy();
});
test('malformed packets cannot leave stale energy stuck on screen',async()=>{
 const a=new AudioEngine();await a.start(DEFAULTS);channels.at(-1).onmessage(music());channels.at(-1).onmessage({spectrum:[]});
 assert.equal(a.frame.volume,0);assert.match(a.error,/Invalid audio packet/);await a.destroy();
});
test('demo only runs when explicitly requested and off clears it',async()=>{
 const a=new AudioEngine();await a.start({...DEFAULTS,mode:'demo'});assert.ok(a.tick(performance.now(),.016).volume>0);
 await a.start({...DEFAULTS,mode:'off'});assert.equal(a.tick(performance.now(),.016).volume,0);await a.destroy();
});

test('source-selection debounce cannot label old audio as the newly selected input',async()=>{
 const a=new AudioEngine();await a.start(DEFAULTS);const old=channels.at(-1);old.onmessage(music());
 a.invalidateForRestart({...DEFAULTS,mode:'microphone'});old.onmessage(music());
 assert.equal(a.tick(performance.now(),.016).volume,0);assert.match(a.frame.microphoneStatus,/Connecting/);
 await a.start({...DEFAULTS,mode:'microphone'});channels.at(-1).onmessage({...music(),microphoneStatus:'Listening: Mic'});
 assert.equal(a.frame.volume,.6);await a.destroy();
});

test('stop immediately rejects old native packets and clears analysis',async()=>{
 const a=new AudioEngine();await a.start(DEFAULTS);const old=channels.at(-1);old.onmessage(music());
 await a.stop();old.onmessage(music());assert.equal(a.mode,'off');assert.equal(a.frame.volume,0);
 assert.equal(a.tick(1000,.016).volume,0);
 await a.start(DEFAULTS);old.onmessage(music());assert.equal(a.frame.volume,0);await a.stop();
});
