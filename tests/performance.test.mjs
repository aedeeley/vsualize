import test from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer, AdaptiveQuality } from '../dist/performance.js';
import { planResolution, reportResolution, describeResolution } from '../dist/resolution.js';
import { Renderer } from '../dist/renderer.js';
import { DEFAULTS, demoFrame, silentFrame } from '../dist/settings.js';

test('60fps pacing stays near 60fps on 60, 120, 144 and 165Hz displays', () => {
  for (const hz of [60, 120, 144, 165]) {
    const pacer = new FramePacer(); let count = 0;
    for (let i = 0; i < hz * 10; i++) if (pacer.next(1000 + i * 1000 / hz, 60) !== null) count++;
    assert.ok(Math.abs(count - 600) <= 1, `${hz}Hz: ${count} frames`);
  }
});
test('hidden windows, long stalls and FPS changes do not build a catch-up queue', () => {
  const p = new FramePacer(); assert.ok(p.next(10, 60));
  assert.equal(p.next(12, 60), null);
  assert.equal(p.next(10000, 60, true), null);
  assert.equal(p.next(20000, 60), 1 / 60);
  assert.ok(p.next(30000, 60) <= .1);
  assert.equal(p.next(30001, 60), null);
  assert.equal(p.next(30002, 30), .002);
  assert.equal(p.next(NaN, 60), null);
});
test('Auto caps large heavy scenes but renders small widgets natively', () => {
  for (const heavy of [false, true]) {
    const budget = heavy ? 1250000 : 2000000;
    const p = planResolution(3840,2160,1,'auto',heavy);
    assert.ok(p.requestedWidth*p.requestedHeight <= budget*1.002);
    const r = reportResolution(p,p.requestedWidth,p.requestedHeight);
    assert.equal(r.native,false);assert.match(describeResolution(r).label,/Auto/);
    const small = planResolution(700,400,1,'auto',heavy);
    assert.equal(small.requestedWidth,700);assert.equal(small.requestedHeight,400);
  }
});
test('adaptive reductions cannot change explicit Native dimensions', () => {
  for (const scale of [.5,.625,.875,1,NaN]) {
    const p=planResolution(3840,2160,1,'high',true,undefined,scale);
    assert.equal(p.requestedWidth,3840);assert.equal(p.requestedHeight,2160);
  }
});
test('adaptive quality ignores one hitch, reduces sustained load and recovers slowly', () => {
  const a=new AdaptiveQuality();
  for(let i=0;i<12;i++)a.observe(3,.1,60,true);
  a.observe(60,.1,60,true);assert.equal(a.scale,1);
  for(let i=0;i<10;i++)a.observe(20,.1,60,true);
  assert.ok(a.scale<1);const reduced=a.scale;
  for(let i=0;i<30;i++)a.observe(2,.1,60,true);
  assert.equal(a.scale,reduced);
  for(let i=0;i<100;i++)a.observe(2,.1,60,true);
  assert.ok(a.scale>reduced);
  for(let i=0;i<500;i++)a.observe(30,.1,60,true);
  assert.equal(a.scale,.5);a.reset();assert.equal(a.scale,1);
});
test('fallback cadence tolerates alternating 144Hz slots while reducing sustained missed frames', () => {
  const a=new AdaptiveQuality();
  for(let i=0;i<2000;i++)a.observe(i%5<3?13.889:20.833,1/60,60,false);
  assert.equal(a.scale,1);
  for(let i=0;i<200;i++)a.observe(33.333,1/30,60,false);
  assert.ok(a.scale<1);
});
test('120fps selected on a 60Hz display does not cause fallback resolution loss', () => {
  const a=new AdaptiveQuality();
  for(let i=0;i<1800;i++)a.observe(1000/60,1/60,120,false);
  assert.equal(a.scale,1);
});

function recordingGL() {
  const calls={links:0, linkReads:0, draws:0, deletedPrograms:0, errors:[], parameters:[], uploads:[]};
  let complete=false; const listeners={};
  const canvas={width:800,height:500,getBoundingClientRect:()=>({width:800,height:500}),addEventListener:(n,fn)=>listeners[n]=fn,getContext:()=>gl};
  const gl=new Proxy({}, {get(_t,key){
    if(/^[A-Z0-9_]+$/.test(String(key)))return key;
    if(key==='drawingBufferWidth')return canvas.width;
    if(key==='drawingBufferHeight')return canvas.height;
    if(key==='getExtension')return n=>n==='KHR_parallel_shader_compile'?{COMPLETION_STATUS_KHR:'complete'}:null;
    if(key==='getParameter')return n=>n==='MAX_VIEWPORT_DIMS'?[16384,16384]:16384;
    if(key==='getProgramParameter')return (_p,n)=>{if(n==='complete')return complete;calls.linkReads++;return true;};
    if(key==='linkProgram')return ()=>calls.links++;
    if(key==='drawArrays')return ()=>calls.draws++;
    if(key==='deleteProgram')return ()=>calls.deletedPrograms++;
    if(key==='getUniformLocation')return (_p,n)=>n;
    if(key==='texParameteri')return (...a)=>calls.parameters.push(a);
    if(key==='texSubImage2D')return (...a)=>calls.uploads.push(a);
    if(String(key).startsWith('create'))return ()=>({});
    return ()=>{};
  }});
  globalThis.window={devicePixelRatio:1,clearTimeout(){},setTimeout(){return 0;}};
  const renderer=new Renderer(canvas,m=>calls.errors.push(m));
  return {renderer,calls,listeners,complete:()=>complete=true};
}

test('stop cancels prewarming and drawing; resume cannot replay a retained feedback image', () => {
  const r=recordingGL();
  try {
    r.complete();r.renderer.render(demoFrame(1),DEFAULTS,1/60);
    r.renderer.stop();const draws=r.calls.draws,links=r.calls.links;
    r.renderer.warmAll();r.renderer.prewarm('lava');
    for(let i=0;i<90;i++)r.renderer.render(demoFrame(i),DEFAULTS,1/60);
    assert.equal(r.calls.draws,draws);assert.equal(r.calls.links,links);
    assert.equal(r.renderer.feedbackDrawn,false);assert.equal(r.renderer.feedbackContentKey,'');
    r.renderer.resume();r.renderer.render(demoFrame(2),DEFAULTS,1/60);assert.equal(r.calls.draws,draws+1);
  } finally {r.renderer.destroy();delete globalThis.window;}
});

test('reaction extremes preserve renderer audio-history sampling and impulse timestamps', () => {
  const snapshots = [0, 3].map(motion => {
    const r = recordingGL();
    try {
      r.complete();
      for (let i=0; i<180; i++) r.renderer.render(demoFrame(i/60), {...DEFAULTS, motion}, 1/60);
      return {head:r.renderer.historyHead, phase:r.renderer.historyElapsed, clock:r.renderer.motion.state.clock,
        impulses:[...r.renderer.impulseHistory.data], uploads:r.calls.uploads.length};
    } finally { r.renderer.destroy(); delete globalThis.window; }
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.ok(snapshots[0].head > 0);
});
test('parallel shader prewarming never reads blocking link status until completion and caches effects', () => {
  const r=recordingGL();
  try {
    r.renderer.prewarm('soundform');r.renderer.prewarm('soundform');
    assert.equal(r.calls.links,1);assert.equal(r.calls.linkReads,0);
    r.renderer.render(demoFrame(1),DEFAULTS,1/60);
    assert.equal(r.calls.draws,0);assert.equal(r.calls.linkReads,0);
    r.complete();r.renderer.render(demoFrame(1),DEFAULTS,1/60);
    r.renderer.render(demoFrame(2),DEFAULTS,1/60);
    assert.equal(r.calls.draws,2);assert.equal(r.calls.links,1);assert.equal(r.calls.linkReads,1);
    assert.deepEqual(r.calls.errors,[]);
  } finally {r.renderer.destroy();delete globalThis.window;}
});
test('ripple field repeats both axes and source restarts clear half-float history', () => {
  const r=recordingGL();
  try {
    assert.ok(r.calls.parameters.some(a=>a[1]==='TEXTURE_WRAP_T'&&a[2]==='REPEAT'));
    r.complete();r.renderer.motion.resetAudio();r.renderer.render(demoFrame(1),DEFAULTS,1/60);
    assert.ok(r.calls.uploads.some(a=>a[4]===128&&a[5]===64&&a[7]==='FLOAT'&&a[8] instanceof Float32Array));
  } finally {r.renderer.destroy();delete globalThis.window;}
});
test('silence with idle motion disabled stops GPU draws, while edits and new sound redraw', () => {
  const r=recordingGL();
  try {
    r.complete();const settings={...DEFAULTS,quality:'high',idleMotion:false};
    for(let i=0;i<120;i++)r.renderer.render(silentFrame(),settings,1/60);
    const resting=r.calls.draws;assert.ok(resting<60);
    for(let i=0;i<120;i++)r.renderer.render(silentFrame(),settings,1/60);
    assert.equal(r.calls.draws,resting);
    r.renderer.render(silentFrame(),{...settings,glow:.9},1/60);assert.equal(r.calls.draws,resting+1);
    r.renderer.render(silentFrame(),{...settings,glow:.9,zoom:1.5},1/60);assert.equal(r.calls.draws,resting+2);
    r.renderer.render(demoFrame(1),settings,1/60);assert.equal(r.calls.draws,resting+3);
  } finally {r.renderer.destroy();delete globalThis.window;}
});
test('bilinear repeated history coordinates match manual adjacent-row interpolation across seam', () => {
  const rows=Array.from({length:64},(_,i)=>Math.sin(i*.77));
  const mod=n=>(n%64+64)%64;
  for(const head of [0,1,31,63])for(let age=0;age<62;age+=.127) {
    const whole=Math.floor(age),fraction=age-whole;
    const manual=rows[mod(head-whole)]*(1-fraction)+rows[mod(head-whole-1)]*fraction;
    const coordinate=mod(head-age),lo=Math.floor(coordinate),mix=coordinate-lo;
    const filtered=rows[lo]*(1-mix)+rows[mod(lo+1)]*mix;
    assert.ok(Math.abs(manual-filtered)<1e-12);
  }
});
