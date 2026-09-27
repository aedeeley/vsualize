// Offline screening of recorded shader output, not a photosensitivity certification.
// Physical angular area, HDR and flashes above the sample Nyquist rate require external review.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve,extname} from 'node:path';
import {gzipSync} from 'node:zlib';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const performanceOnly=process.argv.includes('--performance-only');
const hardware=process.argv.includes('--hardware');
const width=performanceOnly?640:160,height=performanceOnly?600:90,measureMs=hardware?30000:5000;
const root=resolve('dist'),out=resolve('artifacts/safety/flash');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
 try {
  if(req.url==='/assessment') {res.setHeader('Content-Type','text/html');res.end(`<canvas id="c" width="${width}" height="${height}"></canvas>`);return;}
  const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/')&&!file.startsWith(root+'\\')){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'text/plain');res.end(await readFile(file));
 } catch {res.writeHead(404).end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:[...(hardware?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const start=Date.now(),results=[],performanceResults=[];
try {
 const page=await browser.newPage({viewport:{width,height}});await page.goto(`http://127.0.0.1:${server.address().port}/assessment`);
 const matrix=await page.evaluate(async()=>{
  const [{Renderer},{DEFAULTS,demoFrame},{VISUAL_IDS},{PALETTE_IDS}]=await Promise.all([import('/renderer.js'),import('/settings.js'),import('/catalog.js'),import('/visual-presets.js')]);
  window.assessment={Renderer,DEFAULTS,demoFrame};return {visuals:VISUAL_IDS,palettes:PALETTE_IDS};
 });
 for(const visual of performanceOnly?[]:matrix.visuals) {
  for(const palette of matrix.palettes) for(const extreme of ['minimum','maximum']) {
   if(Date.now()-start>300000) throw Error('Assessment hit its five-minute workload cutoff; partial recordings retained.');
   const capture=await page.evaluate(({visual,palette,extreme})=>{
    const {Renderer,DEFAULTS,demoFrame}=window.assessment,c=document.getElementById('c');
    c.style.cssText='width:160px;height:90px';
    const errors=[],r=new Renderer(c,e=>errors.push(e),true);r.validateAll();
    const gl=c.getContext('webgl2'),pixels=new Uint8Array(160*90*4),record=new Uint8Array(120*160*90*3);
    const settings={...DEFAULTS,visual,palette,quality:'high',fps:30,background:'solid',backgroundColor:'#000000',opacity:1,
     intensity:extreme==='maximum'?3:0,glow:extreme==='maximum'?1:0,lineWidth:extreme==='maximum'?4:.35,motion:extreme==='maximum'?3:0,zoom:extreme==='maximum'?2.5:.5,idleMotion:true};
    const begin=performance.now();
    for(let frame=0;frame<120;frame++) {
     // Alternating silence/full-spectrum bursts plus palette/effect transition at midpoint.
     const audio=demoFrame(frame/30),level=frame%6<3?1:0;
     audio.volume=audio.bass=audio.mid=audio.treble=audio.beat=level;audio.spectrum.fill(level);
     if(frame===60) settings.visual=visual==='soundform'?'kaleidoscope':'soundform';
     if(frame===61) settings.visual=visual;
     r.render(audio,settings,1/30);gl.readPixels(0,0,160,90,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     for(let i=0;i<160*90;i++)record.set(pixels.subarray(i*4,i*4+3),(frame*160*90+i)*3);
    }
    const elapsed=performance.now()-begin;r.destroy();
    let binary='';for(let i=0;i<record.length;i+=8192)binary+=String.fromCharCode(...record.subarray(i,i+8192));
    return {data:btoa(binary),elapsed,errors};
   },{visual,palette,extreme});
   const rgb=Buffer.from(capture.data,'base64'),name=`${visual}-${palette}-${extreme}`;
   await writeFile(resolve(out,name+'.rgb.gz'),gzipSync(rgb));
   const assessment=screen(rgb,160*90,120,30);
   results.push({visual,palette,extreme,...assessment,renderReadbackMs:capture.elapsed,errors:capture.errors,recording:name+'.rgb.gz'});
  }
  console.log('Recorded and screened '+visual);
 }
 // Same scene/resolution/audio with real frame pacing and a bounded measurement period.
 for(const fps of [60,30]) performanceResults.push(await page.evaluate(async ({fps,measureMs})=>{
  const {Renderer,DEFAULTS,demoFrame}=window.assessment,c=document.getElementById('c'),r=new Renderer(c,()=>{},true);
  const {FramePacer}=await import('/performance.js'),pacer=new FramePacer(),settings={...DEFAULTS,visual:'kaleidoscope',palette:'iris',quality:'auto',fps};
  r.validateAll();r.render(demoFrame(0),settings,1/fps);
  const begin=performance.now();let frames=0,cpu=0;
  while(performance.now()-begin<measureMs) {const now=await new Promise(requestAnimationFrame),dt=pacer.next(now,fps);if(dt!==null){const t=performance.now();r.render(demoFrame((now-begin)/1000),settings,dt);cpu+=performance.now()-t;frames++;}}
  const gl=c.getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
  const measured={fps,frames,elapsedMs:performance.now()-begin,cpuSubmissionMs:cpu,...r.performance,resolution:r.resolution,renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};r.destroy();return measured;
 },{fps,measureMs}));
} finally {
 await browser.close();await new Promise(r=>server.close(r));
 await writeFile(resolve(out,performanceOnly?(hardware?'performance-hardware.json':'performance.json'):'results.json'),JSON.stringify({method:'Conservative per-pixel excursion screening; candidate flags only, not WCAG conformance. No angular-area or HDR validation. Red is a conservative saturated-red excursion proxy, not a full chromaticity analysis.',width,height,fps:30,framesPerRecording:120,recordingFormat:'gzip RGB24, bottom-up rows, consecutive frames',renderer:hardware?'See individual renderer measurements':'Edge / SwiftShader software renderer',results,performanceResults},null,2));
}
function screen(rgb,count,frames,fps) {
 const linear=Array.from({length:256},(_,v)=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
 let flagged=0,redFlagged=0,maxFlashes=0;
 for(let pixel=0;pixel<count;pixel++) {
  const streams=[[],[]];
  for(let frame=0;frame<frames;frame++){const i=(frame*count+pixel)*3,R=linear[rgb[i]],G=linear[rgb[i+1]],B=linear[rgb[i+2]];streams[0].push(.2126*R+.7152*G+.0722*B);streams[1].push(R/(R+G+B||1)>=.8?R:0);}
  for(let type=0;type<2;type++) {
   const values=streams[type],events=[];let anchor=values[0],direction=0,pending=0,max=0;
   for(let frame=1;frame<frames;frame++) {
    const value=values[frame],diff=value-anchor;
    if(direction===1&&value>anchor || direction===-1&&value<anchor){anchor=value;continue;}
    if(Math.abs(diff)<.1||Math.min(value,anchor)>=.8)continue;
    const next=Math.sign(diff);if(next!==direction){if(pending){events.push(frame);pending=0;}else pending=1;direction=next;anchor=value;}
    while(events.length&&frame-events[0]>=fps)events.shift();max=Math.max(max,events.length);
   }
   if(type===0){if(max>3)flagged++;maxFlashes=Math.max(maxFlashes,max);}else if(max>3)redFlagged++;
  }
 }
 return {generalCandidatePixels:flagged,redCandidatePixels:redFlagged,generalCandidateFraction:flagged/count,redCandidateFraction:redFlagged/count,maxGeneralFlashesInOneSecond:maxFlashes,requiresReview:flagged>0||redFlagged>0};
}
