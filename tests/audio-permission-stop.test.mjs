import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../dist/settings.js';
globalThis.window={};
const {AudioEngine}=await import('../dist/audio.js');
test('Stop does not wait for a permission prompt; a late grant releases its tracks',async()=>{
 let grant,stopped=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(r=>grant=r)}}});
 const a=new AudioEngine();const start=a.start({...DEFAULTS,mode:'microphone'});
 while(!grant) await new Promise(r=>setTimeout(r,0));
 await a.stop();assert.equal(a.mode,'off');
 grant({getTracks:()=>[{stop:()=>stopped++}]});await start;assert.equal(stopped,1);assert.equal(a.frame.volume,0);
 delete globalThis.navigator;
});
