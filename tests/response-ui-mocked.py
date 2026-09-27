"""Production UI event tests. Native IPC and WebGL are explicitly mocked.
No graphics validation, Windows execution or device capture is claimed here.
"""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'response'; OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'artifacts/preview/vsualize.html').read_text()
# Reuse only the explicit native test fixture, not its browser test runner.
fixture=(ROOT/'tests/live-desktop-ui.py').read_text().split("stub='''",1)[1].split("'''",1)[0]
gl_stub='''<script>
const originalContext=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(type,...args){
 if(type!=='webgl2')return originalContext.call(this,type,...args);
 const constants=new Map(); const gl=new Proxy({}, {get(target,key){
  if(typeof key!=='string')return undefined;
  if(/^[A-Z_0-9]+$/.test(key)){if(!constants.has(key))constants.set(key,constants.size+1);return constants.get(key);}
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
  if(key==='checkFramebufferStatus')return ()=>gl.FRAMEBUFFER_COMPLETE;
  if(key.startsWith('create')||key==='getUniformLocation')return ()=>({});
  if(key.endsWith('InfoLog'))return ()=>'';
  return ()=>{};
 }});return gl;
};
</script>'''
checks=[]
def check(name,value):
 checks.append({'name':name,'passed':bool(value)})
 if not value:raise AssertionError(name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':760,'height':680});errors=[]
 page.on('pageerror',lambda error: errors.append(str(error)))
 page.set_content(html.replace('<head>','<head>'+fixture+gl_stub))
 page.wait_for_function('window.__vsualize?.renderer.frames>2')
 page.evaluate('window.__vsualize.show()')
 page.locator('#tab-audio').click()
 page.wait_for_function('window.activeChannel!==null')
 page.evaluate('window.testFrame=makeFrame(true)')
 page.wait_for_function('document.querySelector("#capture-title").textContent.startsWith("LIVE")')
 check('real frontend consumes explicitly mocked live packets',page.evaluate('window.__vsualize.renderer.motion.state.volume')>.4)
 page.locator('#compare-audio').click()
 page.wait_for_timeout(180)
 check('comparison disables rendered response while leaving meters live',page.evaluate('window.__vsualize.renderer.motion.state.volume')==0 and page.locator('#master-level').evaluate('(e)=>e.value')>.5)
 page.evaluate('''Object.assign(window.__vsualize.settings,{visual:'cube',palette:'ember',desktopDevice:'speaker-test',microphoneDevice:'mic-test',sensitivity:2.25,desktopGain:1.15,microphoneGain:.45,reactivity:0,intensity:.1,motion:0,smoothness:0,idleMotion:true})''')
 preserved=page.evaluate('''()=>{const s=window.__vsualize.settings;return [s.visual,s.palette,s.mode,s.desktopDevice,s.microphoneDevice,s.sensitivity,s.desktopGain,s.microphoneGain]}''')
 calls=page.evaluate('window.nativeCalls.length')
 page.locator('#tab-visuals').click();page.locator('#reset-response').click()
 page.wait_for_timeout(200)
 check('recommended button sets response values and disables ambient drift',page.evaluate('''()=>{const s=window.__vsualize.settings;return s.reactivity===1.6&&s.intensity===1.1&&s.motion===.65&&s.idleMotion===false}'''))
 check('smooth response restores 75 percent motion smoothing',page.evaluate('window.__vsualize.settings.smoothness')==.75)
 check('motion smoothing slider is bound to the persisted setting',page.locator('#smoothness').input_value()=='0.75')
 check('recommended button preserves visual, palette, source, devices and gains',preserved==page.evaluate('''()=>{const s=window.__vsualize.settings;return [s.visual,s.palette,s.mode,s.desktopDevice,s.microphoneDevice,s.sensitivity,s.desktopGain,s.microphoneGain]}'''))
 check('recommended button does not restart native capture',not page.evaluate('(i)=>window.nativeCalls.slice(i).some(c=>c.command==="start_audio"||c.command==="stop_audio")',calls))
 check('recommended button restores response from comparison mode',page.locator('#compare-audio').get_attribute('aria-pressed')=='false' and page.evaluate('window.__vsualize.renderer.motion.state.volume')>.4)
 check('one custom window control row',page.locator('.window-actions').count()==1)
 check('4px outer clipping preserved',page.evaluate('getComputedStyle(document.body).clipPath')=='inset(0px round 4px)')
 for width,height in [(300,240),(420,700),(960,450)]:
  page.set_viewport_size({'width':width,'height':height})
  page.evaluate('window.__vsualize.show()')
  page.locator('#reset-response').scroll_into_view_if_needed()
  check(f'recommended button reachable at {width}x{height}',page.locator('#reset-response').is_visible())
 check('no production JavaScript exceptions',not errors)
 browser.close()
report={'passed':sum(c['passed'] for c in checks),'checks':checks,'nativeIPC':'mocked','WebGL':'mocked','WindowsTested':False,'productionUIJavaScriptTested':True,'pixelRenderingTested':False}
(OUT/'ui-mocked-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
