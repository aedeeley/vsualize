// Lossless, deterministic shader recordings for external analysis. No viewing required.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve,relative,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const args = process.argv.slice(2);
const option = (key, fallback) => { const i=args.indexOf('--'+key); return i<0?fallback:args[i+1]; };
const number = (key,fallback,min,max) => { const n=Number(option(key,fallback)); if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid --'+key); return n; };
const width=number('width',1920,160,7680),height=number('height',1080,90,4320),fps=number('fps',60,30,60);
if(![30,60].includes(fps))throw Error('Use 30 or 60 fps.');
const seconds=number('seconds',20,2,120),limit=number('limit',1,1,100),wallMinutes=number('wall-minutes',5,1,30);
const out=resolve(option('out','artifacts/safety/recordings')),root=resolve('dist');
await mkdir(out,{recursive:true});
const {VISUAL_IDS}=await import(pathToFileURL(resolve('dist/catalog.js')));
const {PALETTE_IDS}=await import(pathToFileURL(resolve('dist/visual-presets.js')));
const cases=[];
for(const visual of VISUAL_IDS)for(const palette of PALETTE_IDS)for(const profile of ['default','minimum','maximum'])for(const gentler of [false,true]) {
 cases.push({id:`${visual}-${palette}-${profile}-${gentler?'gentler':'original'}`,visual,palette,profile,gentler,seed:20260927});
}
const selected=option('case','');
if(selected&&!cases.some(c=>c.id===selected))throw Error('Unknown --case; inspect plan.json.');
const sourceHash=createHash('sha256');
async function hashTree(dir){for(const item of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=resolve(dir,item.name);if(item.isDirectory())await hashTree(file);else {sourceHash.update(relative(root,file).replaceAll('\\','/'));sourceHash.update(await readFile(file));}}}
await hashTree(root);
const plan={schemaVersion:1,width,height,fps,seconds,frames:fps*seconds,seed:20260927,distSha256:sourceHash.digest('hex'),color:'sRGB SDR, opaque black composite; HDR not covered',method:'Sequential fixed-timestep offline rendering, not a realtime screen capture. Lossless PNG frames, top-down rows. External analysis pending.',audio:'0-20% silence; 20-45% smooth demo; 45-85% full-band square bursts sweeping 3-20 Hz; 85-100% demo. Effect/palette switch at 50%, return at 60%.',cases};
await writeFile(resolve(out,'plan.json'),JSON.stringify(plan,null,2)+'\n');
if(args.includes('--plan-only')) {console.log(`Prepared ${cases.length} cases in ${out}; none rendered.`);process.exit(0);}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const server=createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/record'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><style>html,body{margin:0;background:black}</style><canvas id="c"></canvas>');return;}
 const file=resolve(root,'.'+pathname),rel=relative(root,file);
 if(rel.startsWith('..')||resolve(file)===root){res.writeHead(403).end();return;}
 res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'text/plain');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,watchdog;
const began=Date.now();
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:args.includes('--software')?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 watchdog=setTimeout(()=>{void browser.close().catch(()=>{});},wallMinutes*60_000);
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 page.setDefaultTimeout(60_000);
 for(const spec of cases.filter(c=>!selected||c.id===selected).slice(0,limit)){
  const dir=resolve(out,spec.id);await mkdir(dir); // Refuse overwrite: recordings bind to their source hash.
  const manifest={...plan,cases:undefined,case:spec,complete:false,capturedFrames:0,frameHashes:[],errors:[]};
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}/record`);
   manifest.renderer=await page.evaluate(async({spec,width,height,fps,frames})=>{
    let seed=spec.seed>>>0;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const [{Renderer},{DEFAULTS,demoFrame},{VISUAL_DEFAULTS,CONTROL_LIMITS,PALETTE_IDS},{VISUAL_IDS}]=await Promise.all([import('/renderer.js'),import('/settings.js'),import('/visual-presets.js'),import('/catalog.js')]);
    const c=document.getElementById('c');c.width=width;c.height=height;c.style.width=width+'px';c.style.height=height+'px';
    const errors=[],r=new Renderer(c,e=>errors.push(e),true);r.validateAll();
    const settings={...DEFAULTS,...VISUAL_DEFAULTS[spec.visual],visual:spec.visual,palette:spec.palette,quality:'high',fps,background:'solid',backgroundColor:'#000000',opacity:1,gentlerVisuals:spec.gentler};
    if(spec.profile!=='default')for(const [key,range]of Object.entries(CONTROL_LIMITS))settings[key]=range[spec.profile==='maximum'?1:0];
    const gl=c.getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
    window.capture={r,c,settings,demoFrame,errors,spec,fps,frames,VISUAL_IDS,PALETTE_IDS,lastPng:null,lastFrame:-1};
    return {vendor:info?gl.getParameter(info.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),settings};
   },{spec,width,height,fps,frames:plan.frames});
   for(let frame=0;frame<plan.frames;frame++){
    if(Date.now()-began>wallMinutes*60_000)throw Error('Workload cutoff reached; incomplete capture retained.');
    const result=await page.evaluate(frame=>{
     const x=window.capture,{r,c,settings,demoFrame,spec,fps,frames,VISUAL_IDS,PALETTE_IDS}=x,t=frame/fps,p=frame/frames,audio=demoFrame(t);
     if(p<.2||(p>=.45&&p<.85)){
      const u=Math.max(0,t-frames/fps*.45),duration=frames/fps*.4;
      const cycles=3*u+17*u*u/(2*duration),level=p<.2?0:(cycles%1<.5?1:0);
      audio.volume=audio.bass=audio.mid=audio.treble=audio.beat=level;audio.spectrum.fill(level);audio.waveform.fill(level?1:0);
     }
     const transition=p>=.5&&p<.6;
     settings.visual=transition?VISUAL_IDS[(VISUAL_IDS.indexOf(spec.visual)+1)%VISUAL_IDS.length]:spec.visual;
     settings.palette=transition?PALETTE_IDS[(PALETTE_IDS.indexOf(spec.palette)+1)%PALETTE_IDS.length]:spec.palette;
     r.render(audio,settings,1/fps);
     // preserveDrawingBuffer is false. A skipped draw retains the compositor's last
     // image, but a later buffer read can be blank. Reuse exactly the captured image.
     if(r.frames!==x.lastFrame||x.lastPng===null){x.lastPng=c.toDataURL('image/png').split(',')[1];x.lastFrame=r.frames;}
     return {png:x.lastPng,width:c.width,height:c.height,errors:x.errors.splice(0)};
    },frame);
    if(result.width!==width||result.height!==height)throw Error('Renderer did not produce the requested native resolution.');
    if(result.errors.length){manifest.errors.push(...result.errors);throw Error('Shader/render error.');}
    const png=Buffer.from(result.png,'base64'),name=`frame-${String(frame).padStart(6,'0')}.png`;
    await writeFile(resolve(dir,name),png);manifest.frameHashes.push({file:name,sha256:createHash('sha256').update(png).digest('hex')});manifest.capturedFrames++;
    if(frame%fps===0)console.log(`${spec.id}: ${frame/fps}/${seconds}s`);
   }
   manifest.complete=true;
  }catch(error){manifest.failure=String(error);throw error;}
  finally{await writeFile(resolve(dir,'recording.json'),JSON.stringify(manifest,null,2)+'\n');await page.evaluate(()=>window.capture?.r.destroy()).catch(()=>{});}
 }
}finally{clearTimeout(watchdog);await browser?.close();await new Promise(r=>server.close(r));}
