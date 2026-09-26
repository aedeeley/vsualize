import test from 'node:test';
import assert from 'node:assert/strict';
import { planResolution, reportResolution, describeResolution } from '../dist/resolution.js';
import { DEFAULTS, sanitizeSettings, demoFrame } from '../dist/settings.js';
import { VISUALS } from '../dist/visuals/index.js';
import { Renderer } from '../dist/renderer.js';

for (const dpr of [1,1.25,1.5,1.75,2,2.5,3,4]) {
  test(`Native requests all 3840 x 2160 pixels at ${dpr*100}% scaling`, () => {
    for (const visual of Object.values(VISUALS)) {
      const p = planResolution(3840/dpr,2160/dpr,dpr,'high',visual.cost==='heavy');
      assert.equal(p.requestedWidth,3840,visual.id); assert.equal(p.requestedHeight,2160,visual.id);
      assert.equal(p.gpuLimited,false);
    }
  });
}
test('Native has no megapixel ceiling for 4K DCI, ultrawide or supported 8K',()=>{
  for (const [w,h] of [[4096,2160],[5120,2160],[7680,4320]]) {
    const p=planResolution(w,h,1,'high',true);
    assert.equal(p.requestedWidth,w);assert.equal(p.requestedHeight,h);
  }
});
test('physical pixel size follows fractional CSS dimensions, fullscreen and return',()=>{
  const plans=[[683.2,384,1.25],[2560,1440,1.5],[683.2,384,1.25]].map(a=>planResolution(...a,'high',true));
  assert.equal(plans[0].requestedWidth,854);assert.equal(plans[1].requestedWidth,3840);
  assert.deepEqual(plans[2],plans[0]);
});
test('Light and Balanced preserve their previous reduced-pixel budgets',()=>{
  for(const [q,w,h] of [['low',666,375],['medium',1075,605]]){
    const p=planResolution(3840,2160,1,q,true);
    assert.equal(p.requestedWidth,w);assert.equal(p.requestedHeight,h);
  }
});
test('graphics size limits are proportionate, explicit and not sold as Native',()=>{
  const p=planResolution(3840,2160,1,'high',true,{width:2048,height:2048});
  assert.equal(p.requestedWidth,2048);assert.equal(p.requestedHeight,1152);assert.equal(p.gpuLimited,true);
  const r=reportResolution(p,2048,1152), t=describeResolution(r);
  assert.equal(r.native,false);assert.equal(t.limited,true);assert.match(t.label,/Graphics limited/);
  assert.match(t.detail,/GPU size limit/);
});
test('readout reports real drawing buffer size, not requested canvas dimensions',()=>{
  const p=planResolution(3840,2160,1,'high',true);
  const r=reportResolution(p,1920,1080),t=describeResolution(r);
  assert.equal(r.native,false);assert.equal(r.implementationLimited,true);
  assert.match(t.label,/1920 × 1080/);assert.match(t.label,/50% scale/);assert.doesNotMatch(t.label,/Native/);
});
test('unallocated drawing buffer and invalid numerical inputs cannot claim native resolution',()=>{
  const p=planResolution(NaN,Infinity,NaN,'high',true);
  assert.equal(p.requestedWidth,1);assert.equal(p.requestedHeight,1);
  assert.equal(reportResolution(p,NaN,Infinity).native,false);
  assert.match(describeResolution(null).label,/Waiting/);
});
test('true native readout is unambiguous; one-pixel underallocation is not rounded to 100%',()=>{
  const p=planResolution(3840,2160,1,'high',true);
  assert.equal(describeResolution(reportResolution(p,3840,2160)).label,'Rendering: 3840 × 2160 · Native · 100%');
  assert.doesNotMatch(describeResolution(reportResolution(p,3839,2160)).label,/Native|100%/);
});
test('Auto is the new-install default, and explicit saved quality choices survive',()=>{
  assert.equal(DEFAULTS.quality,'auto');
  for(const quality of ['auto','low','medium','high']){
    const prior=sanitizeSettings({...DEFAULTS,quality,visual:'mandelbrot',palette:'ember',mode:'both',smoothness:.9});
    assert.deepEqual(sanitizeSettings(prior),prior);
  }
});

// Explicit GL-call recorder, not a graphics test. Separate GLES/browser checks
// exercise real rendering. This verifies buffer, viewport and feedback plumbing.
function recorder(actualScale=1) {
  const calls={allocations:[],viewports:[],blits:[],uniforms:new Map(),errors:[]};
  const canvas={width:300,height:150,clientWidth:2560,clientHeight:1440,
    getBoundingClientRect(){return {width:this.clientWidth,height:this.clientHeight};},addEventListener(){},getContext(){return gl;}};
  const gl=new Proxy({}, { get(_target,key){
    if(/^[A-Z0-9_]+$/.test(String(key)))return key;
    if(key==='drawingBufferWidth')return Math.round(canvas.width*actualScale);
    if(key==='drawingBufferHeight')return Math.round(canvas.height*actualScale);
    if(key==='getParameter')return p=>p==='MAX_VIEWPORT_DIMS'?new Int32Array([16384,16384]):16384;
    if(key==='getUniformLocation')return (_p,n)=>n;
    if(key==='uniform2f')return (n,...v)=>calls.uniforms.set(n,v);
    if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
    if(key==='checkFramebufferStatus')return ()=>'FRAMEBUFFER_COMPLETE';
    if(key==='texImage2D')return (...a)=>calls.allocations.push({width:a[3],height:a[4],data:a[8]});
    if(key==='viewport')return (...a)=>calls.viewports.push(a);
    if(key==='blitFramebuffer')return (...a)=>calls.blits.push(a);
    if(String(key).startsWith('create'))return ()=>({});
    return ()=>{};
  }});
  globalThis.window={devicePixelRatio:1.5};
  const renderer=new Renderer(canvas,m=>calls.errors.push(m));
  return {canvas,renderer,calls};
}
test('all effects honor explicit native viewport and uResolution, including feedback',()=>{
  const {renderer,calls}=recorder();
  try{
    for(const visual of Object.keys(VISUALS)){
      renderer.render(demoFrame(2),{...DEFAULTS,quality:'high',visual},1/60);
      assert.deepEqual(calls.viewports.at(-1),[0,0,3840,2160]);
      assert.deepEqual(calls.uniforms.get('uResolution'),[3840,2160]);
      assert.equal(renderer.resolution.native,true);
    }
    assert.deepEqual(calls.errors,[]);
    assert.ok(calls.allocations.some(a=>a.width===3840&&a.height===2160&&a.data===null));
    assert.ok(calls.blits.some(a=>a.slice(0,8).join(',')==='0,0,3840,2160,0,0,3840,2160'));
  } finally {renderer.destroy();delete globalThis.window;}
});
test('smaller actual allocation governs viewport, uniforms and feedback; warning is shown once',()=>{
  const {renderer,calls}=recorder(.5);
  try{
    for(let i=0;i<3;i++)renderer.render(demoFrame(2),{...DEFAULTS,quality:'high',visual:'groove'},1/60);
    assert.deepEqual(calls.viewports.at(-1),[0,0,1920,1080]);
    assert.deepEqual(calls.uniforms.get('uResolution'),[1920,1080]);
    assert.equal(calls.errors.length,1);
    assert.equal(renderer.resolution.implementationLimited,true);
    const targets=calls.allocations.filter(a=>a.width===1920&&a.height===1080);
    assert.equal(targets.length,2); // Reuse the same ping-pong buffers on subsequent frames.
  }finally{renderer.destroy();delete globalThis.window;}
});
test('Native resize updates viewport and returns to smaller window without stale sizes',()=>{
  const {renderer,canvas}=recorder();
  try{
    renderer.render(demoFrame(2),{...DEFAULTS,quality:'high'},1/60); assert.equal(canvas.width,3840);
    canvas.clientWidth=800;canvas.clientHeight=600;
    renderer.render(demoFrame(2),{...DEFAULTS,quality:'high'},1/60);assert.equal(canvas.width,1200);assert.equal(canvas.height,900);
    window.devicePixelRatio=3;
    renderer.render(demoFrame(2),{...DEFAULTS,quality:'high'},1/60);assert.equal(canvas.width,2400);assert.equal(canvas.height,1800);
  }finally{renderer.destroy();delete globalThis.window;}
});
test('feedback control edits reuse GPU buffers rather than reallocating every slider step',()=>{
  const {renderer,calls}=recorder();
  try {
    for (const glow of [.1,.3,.5,.8]) renderer.render(demoFrame(2),{...DEFAULTS,quality:'high',visual:'groove',glow},1/60);
    assert.equal(calls.allocations.filter(a=>a.width===3840&&a.height===2160).length,2);
  } finally {renderer.destroy();delete globalThis.window;}
});

test('a paused image cannot claim native after fullscreen enlarges its destination',()=>{
  const {renderer,canvas}=recorder();
  try{
    canvas.clientWidth=800;canvas.clientHeight=600;
    renderer.render(demoFrame(2),{...DEFAULTS,quality:'high'},1/60);renderer.paused=true;
    canvas.clientWidth=2560;canvas.clientHeight=1440;
    renderer.render(demoFrame(2),{...DEFAULTS,quality:'high'},1/60);
    assert.equal(renderer.resolution.actualWidth,1200);
    assert.equal(renderer.resolution.nativeWidth,3840);
    assert.equal(renderer.resolution.native,false);
    renderer.paused=false;renderer.render(demoFrame(2),{...DEFAULTS,quality:'high'},1/60);
    assert.equal(renderer.resolution.native,true);
  }finally{renderer.destroy();delete globalThis.window;}
});
