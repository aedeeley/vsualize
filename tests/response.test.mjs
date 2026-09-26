import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ResponseAnalyzer, spectralAmplitude } from '../dist/response.js';
import { MotionDriver } from '../dist/motion.js';
import { DEFAULTS, silentFrame } from '../dist/settings.js';
const f=(extra={})=>({...silentFrame(),...extra});
const tone=(bin,value=.8)=>{
 const x=f({volume:.55}); x.spectrum=Array.from({length:128},(_,i)=>Math.max(0,value-Math.abs(i-bin)*.12));
 for(const [k,a,b] of [['bass',5,44],['mid',44,89],['treble',89,125]])x[k]=x.spectrum.slice(a,b).reduce((x,y)=>x+y,0)/(b-a);
 return x;
};
const fixture=JSON.parse(readFileSync(new URL('fixtures/pcm-response.json',import.meta.url),'utf8'));
test('display amplitude inversion preserves dB contrast and sanitizes invalid values',()=>{
 assert.equal(spectralAmplitude(0),0);assert.equal(spectralAmplitude(NaN),0);assert.equal(spectralAmplitude(Infinity),0);
 assert.ok(spectralAmplitude(.8)/spectralAmplitude(.6)>4);
});
test('narrow bass notes survive averaging across a broad display band',()=>{
 const x=tone(24),r=new ResponseAnalyzer();for(let i=0;i<90;i++)r.update(x,1/30);
 assert.ok(r.value.bass>.65);assert.ok(r.value.mid<.02);assert.ok(r.value.treble<.02);
});
test('equal-volume bass, mid and treble notes create different band features',()=>{
 for(const [bin,band] of [[24,'bass'],[65,'mid'],[107,'treble']]){
  const r=new ResponseAnalyzer();for(let i=0;i<90;i++)r.update(tone(bin),1/30);
  assert.ok(r.value[band]>.60,band);for(const other of ['bass','mid','treble'])if(other!==band)assert.ok(r.value[other]<.02);
 }
});
test('steady held audio creates one onset, not a fresh attack every frame',()=>{
 const r=new ResponseAnalyzer(),x=tone(24);let count=0;
 for(let i=0;i<720;i++)count+=Number(r.update(x,1/120).lowOnset);
 assert.equal(count,1);assert.ok(r.value.bassHit<.0001);
});
test('silence cannot generate spectrum, geometric energy or onsets',()=>{
 const r=new ResponseAnalyzer();const x=f({volume:0,bass:1,mid:1,treble:1,spectrum:Array(128).fill(1)});
 for(let i=0;i<120;i++){
  const s=r.update(x,1/60);assert.equal(s.bass,0);assert.equal(s.strength,0);assert.equal(s.spectrum.some(v=>v!==0),false);
 }
});
test('transient envelopes recover between separate attacks without rewinding progress',()=>{
 const d=new MotionDriver();let last=0,seen=0;
 for(let i=0;i<240;i++){
  const s=d.update(i%30<3?tone(24):silentFrame(),DEFAULTS,1/60);
  if(s.event)seen++;assert.ok(s.travel>=last);last=s.travel;
  if(i%30===29)assert.ok(s.bassHit<.10);
 }
 assert.equal(seen,8);
});
test('input normalization keeps near-floor spectral noise small',()=>{
 const r=new ResponseAnalyzer(),x=f({volume:.003,bass:.02,spectrum:Array(128).fill(.02)});
 for(let i=0;i<300;i++)r.update(x,1/30);
 assert.ok(r.value.bass<.03);assert.ok(Math.max(...r.value.spectrum)<.03);
});
test('invalid delta and values never contaminate response state',()=>{
 const r=new ResponseAnalyzer(),x=f({volume:Infinity,bass:NaN,mid:-2,treble:3,spectrum:Array(128).fill(NaN)});
 for(const dt of [0,NaN,-1,Infinity,.016])r.update(x,dt);
 assert.ok([...r.value.spectrum,r.value.bass,r.value.mid,r.value.treble,r.value.strength].every(Number.isFinite));
});
test('reset clears adaptation and attack history',()=>{
 const r=new ResponseAnalyzer();r.update(tone(24),.03);r.reset();
 assert.equal(r.value.bass,0);assert.equal(r.value.bassHit,0);assert.equal(Math.max(...r.value.spectrum),0);
});
test('gentle peaks keeps structural attacks intact while reducing light accents',()=>{
 const a=new MotionDriver(),b=new MotionDriver();const x=tone(24);
 for(let i=0;i<90;i++){
  const aa=a.update(i%30<4?x:silentFrame(),{...DEFAULTS,gentlePeaks:true},1/60);
  const bb=b.update(i%30<4?x:silentFrame(),{...DEFAULTS,gentlePeaks:false},1/60);
  assert.equal(aa.impact,bb.impact);assert.equal(aa.bassHit,bb.bassHit);assert.ok(aa.accent<=bb.accent);
 }
});
for(const fps of [30,60,120])test(`PCM burst attacks survive 30 Hz native-style packets rendered at ${fps} Hz`,()=>{
 const r=new ResponseAnalyzer(),observed=[];let lastIdx=-1;
 for(let i=0;i<10*fps;i++){
  const time=i/fps,idx=Math.min(fixture.frames.length-1,Math.floor(time*30+1e-7)),x=fixture.frames[idx];
  const s=r.update(f(x),1/fps);
  for(const [key,band] of [['lowOnset','bass'],['midOnset','mid'],['highOnset','treble']])if(s[key])observed.push({time,band,packet:idx});
  if(idx===lastIdx)assert.ok(!s.lowOnset&&!s.midOnset&&!s.highOnset,'held packet retriggered');lastIdx=idx;
 }
 for(const e of fixture.events) assert.ok(observed.some(o=>o.band===e.band&&o.time>=e.time&&o.time-e.time<=.12),`missing ${e.band} at ${e.time}`);
 assert.ok(!observed.some(e=>e.time<1||e.time>9.2));
});
test('recommended response control restores animation settings without restarting capture',()=>{
 const html=readFileSync(new URL('../static/index.html',import.meta.url),'utf8');
 assert.equal((html.match(/id="reset-response"/g)||[]).length,1);
 const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 const handler=source.slice(source.indexOf("byId('reset-response').addEventListener"),source.indexOf("byId('compare-audio').addEventListener"));
 assert.match(handler,/resetVisualTuning\(settings\)/);assert.match(handler,/comparing = false/);assert.doesNotMatch(handler,/restartAudio\(|settings\.(?:desktopDevice|microphoneDevice|sensitivity)\s*=/);
});
