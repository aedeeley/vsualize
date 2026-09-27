// Real WebGL integration checks. Uses installed Chromium/Edge, never real capture.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const html=await readFile(new URL('../artifacts/preview/vsualize.html',import.meta.url),'utf8');
const out=new URL('../artifacts/safety/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
async function pageFor(saved={},reducedMotion='no-preference',nativeMock='') {
 const page=await browser.newPage({viewport:{width:800,height:700},reducedMotion});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const setup=`<script>window.testOffset=0;const originalNow=Date.now.bind(Date);Date.now=()=>originalNow()+window.testOffset;const memory=new Map([['vsualize.settings.v1',${JSON.stringify(JSON.stringify(saved))}]]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)}});</script>`;
 await page.setContent(html.replace('<head>','<head>'+setup+(nativeMock?`<script>${nativeMock}</script>`:'')));
 await page.waitForFunction(()=>!!window.__vsualize);
 return {page,errors};
}
async function check(name,fn) {await fn();results.push({name,passed:true});console.log('PASS '+name);}
try {
 const {page,errors}=await pageFor();
 await check('first launch is static, notice visible, no capture or frames',async()=>{
  assert.equal(await page.locator('#safety-dialog').evaluate(e=>e.open),true);
  assert.equal(await page.evaluate(()=>window.__vsualize.renderer.frames),0);
  assert.equal(await page.evaluate(()=>window.__vsualize.audio.mode),'off');
  await page.screenshot({path:new URL('first-run.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 });
 await page.locator('#safety-stay').click();
 await check('Keep stopped and control interactions do not start visuals',async()=>{
  await page.locator('#session-controls').click();assert.equal(await page.locator('#safety-settings').isVisible(),true);
  await page.evaluate(()=>window.__vsualize.show());await page.locator('[data-visual="lava"]').click();
  assert.equal(await page.evaluate(()=>window.__vsualize.renderer.frames),0);
 });
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.__vsualize.renderer.frames>0);
 await page.evaluate(()=>window.__vsualize.show());await page.locator('#study-settings-card').click();
 await page.locator('[data-mode="demo"]').click();await page.waitForTimeout(500);
 await page.locator('#study-tab-app').click();
 await check('Eco is reachable and preserves visual tuning',async()=>{
  const before=await page.evaluate(()=>JSON.stringify(window.__vsualize.settings.visualTunings));
  await page.locator('#eco-mode').click();assert.equal(await page.evaluate(()=>window.__vsualize.settings.fps),30);
  await page.locator('#gentler-visuals').check();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__vsualize.settings.visualTunings)),before);
  await page.screenshot({path:new URL('settings.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 });
 await check('Unlimited requires explicit acknowledgement and persists',async()=>{
  await page.locator('#session-minutes').selectOption('0');assert.equal(await page.locator('#unlimited-enable').isDisabled(),true);
  await page.locator('#unlimited-cancel').click();assert.equal(await page.evaluate(()=>window.__vsualize.settings.sessionMinutes),30);
  await page.locator('#session-minutes').selectOption('0');await page.locator('#unlimited-confirm').check();await page.locator('#unlimited-enable').click();
  assert.match(await page.locator('#session-status').innerText(),/Automatic stop disabled/);
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('vsualize.settings.v1')).sessionMinutes),0);
 });
 await page.locator('#session-minutes').selectOption('15');
 await check('expired session stops frames and demo; transparent background becomes black',async()=>{
  await page.evaluate(()=>{window.__vsualize.settings.background='transparent';window.testOffset=16*60000;});
  await page.waitForFunction(()=>document.body.classList.contains('session-stopped'));
  const frames=await page.evaluate(()=>window.__vsualize.renderer.frames);await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window.__vsualize.renderer.frames),frames);
  assert.equal(await page.evaluate(()=>window.__vsualize.audio.mode),'off');
  assert.equal(await page.locator('#session-shield').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
  assert.equal(await page.locator('#visualizer').evaluate(e=>getComputedStyle(e).visibility),'hidden');
  await page.screenshot({path:new URL('stopped.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 });
 await check('resizing and revealing controls cannot replay an old frame',async()=>{
  const frames=await page.evaluate(()=>window.__vsualize.renderer.frames);
  await page.setViewportSize({width:1000,height:800});await page.evaluate(()=>window.__vsualize.show());
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__vsualize.renderer.frames),frames);
 });
 await page.locator('#pause').click();await page.waitForFunction(()=>!document.body.classList.contains('session-stopped'));
 await check('visibility suspension stops and restores without resetting session',async()=>{
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>window.__vsualize.audio.mode==='off');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.body.classList.contains('session-stopped'));
 });
 await check('Space stops outside editing fields; modal Escape keeps stopped',async()=>{
  await page.evaluate(()=>{window.__vsualize.hide();document.getElementById('visualizer').focus();});await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.__vsualize.audio.mode),'off');
  await page.evaluate(()=>document.getElementById('safety-help').click());await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('session-stopped')),true);
 });
 await check('stop controls hide after inactivity and keyboard reveals without resume',async()=>{
  await page.waitForTimeout(10400);assert.equal(await page.locator('#session-rest').isVisible(),false);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.body.classList.contains('session-stopped')),true);
 });
 assert.deepEqual(errors,[]);await page.close();
 const reduced=await pageFor({safetyNoticeVersion:1,sessionMinutes:0,unlimitedAcknowledged:true},'reduce');
 await check('reduced motion starts stopped even with acknowledged unlimited',async()=>{
  assert.equal(await reduced.page.evaluate(()=>window.__vsualize.renderer.frames),0);
  assert.equal(await reduced.page.evaluate(()=>window.__vsualize.settings.gentlerVisuals),true);
  assert.deepEqual(reduced.errors,[]);
 });await reduced.page.close();
 const native=await pageFor({safetyNoticeVersion:1},'no-preference',`
  window.captureStarts=0;window.nativeListeners={};window.pendingStart=null;
  window.__TAURI__={window:{getCurrentWindow:()=>({isFullscreen:async()=>false})},event:{listen:async(name,fn)=>{window.nativeListeners[name]=fn;return()=>{}}},core:{Channel:class{},invoke:async(name,args)=>{
   if(name==='session_status')return{revision:0,epoch:0,phase:'stopped',reason:'notice'};
   if(name==='session_control'){
    if(args.action==='start')return new Promise(resolve=>window.pendingStart=()=>resolve({revision:args.revision,epoch:args.epoch,phase:'running',reason:'manual'}));
    return{revision:args.revision,epoch:args.epoch,phase:'stopped',reason:'manual'};
   }
   if(name==='start_audio'){window.captureStarts++;return;}
   if(name==='list_audio_devices')return[];
   if(name==='check_update')return{currentVersion:'0.4.1',version:null,notes:null};
   return null;
  }}};
 `);
 await check('native Stop invalidates an in-flight Start even with an older command revision',async()=>{
  await native.page.waitForFunction(()=>!!window.pendingStart);
  await native.page.evaluate(()=>{window.nativeListeners['session-stopped']({payload:{epoch:1,revision:1,phase:'stopped',reason:'wake'}});window.pendingStart();});
  await native.page.waitForTimeout(150);
  assert.equal(await native.page.evaluate(()=>window.captureStarts),0);
  assert.equal(await native.page.evaluate(()=>window.__vsualize.renderer.frames),0);
  assert.equal(await native.page.evaluate(()=>document.body.classList.contains('session-stopped')),true);
  assert.deepEqual(native.errors,[]);
 });await native.page.close();
 const startup=await pageFor({safetyNoticeVersion:1},'no-preference',`
  window.captureStarts=0;window.sessionStarts=0;window.nativeListeners={};window.finishStatus=null;
  window.__TAURI__={window:{getCurrentWindow:()=>({isFullscreen:async()=>false})},event:{listen:async(name,fn)=>{window.nativeListeners[name]=fn;return()=>{}}},core:{Channel:class{},invoke:async(name,args)=>{
   if(name==='session_status')return new Promise(resolve=>window.finishStatus=()=>resolve({revision:0,epoch:0,phase:'stopped',reason:'notice'}));
   if(name==='session_control'){if(args.action==='start')window.sessionStarts++;return{revision:args.revision,epoch:args.epoch,phase:args.action==='start'?'running':'stopped',reason:'manual'};}
   if(name==='start_audio'){window.captureStarts++;return;}
   if(name==='list_audio_devices')return[];
   if(name==='check_update')return{currentVersion:'0.4.1',version:null,notes:null};return null;
  }}};
 `);
 await check('native stop during initialization cancels automatic startup',async()=>{
  await startup.page.waitForFunction(()=>!!window.finishStatus);
  await startup.page.evaluate(()=>{window.nativeListeners['session-stopped']({payload:{epoch:1,revision:0,phase:'stopped',reason:'wake'}});window.finishStatus();});
  await startup.page.waitForTimeout(150);assert.equal(await startup.page.evaluate(()=>window.sessionStarts),0);
  assert.equal(await startup.page.evaluate(()=>window.captureStarts),0);assert.equal(await startup.page.evaluate(()=>window.__vsualize.renderer.frames),0);
  assert.deepEqual(startup.errors,[]);
 });await startup.page.close();
 const narrow=await pageFor();
 await check('first-run guidance remains readable and keyboard reachable at minimum window size',async()=>{
  await narrow.page.setViewportSize({width:300,height:240});
  await narrow.page.locator('#safety-title').focus();
  assert.equal(await narrow.page.locator('#safety-title').isVisible(),true);
  assert.equal(await narrow.page.locator('#safety-dialog').evaluate(e=>e.scrollTop),0);
  await narrow.page.keyboard.press('Tab');await narrow.page.keyboard.press('Tab');
  assert.equal(await narrow.page.evaluate(()=>document.activeElement.id),'safety-stay');
  await narrow.page.keyboard.press('Enter');assert.equal(await narrow.page.evaluate(()=>window.__vsualize.renderer.frames),0);
  assert.deepEqual(narrow.errors,[]);
 });await narrow.page.close();
 await writeFile(new URL('ui-results.json',out),JSON.stringify(results,null,2));
} finally {await browser.close();}
