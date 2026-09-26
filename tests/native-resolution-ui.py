"""Production UI layout/readout checks with an explicitly mocked WebGL context.
No native Windows APIs, shaders or audio are claimed tested by this file.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/native4k';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'Vsualize-Preview.html').read_text()
stub='''<script>
const storage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
window.mockBufferScale=1;
const originalContext=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(kind,...args){
 if(kind!=='webgl2')return originalContext.call(this,kind,...args);
 const canvas=this;
 return new Proxy({}, {get:(t,k)=>{
   if(/^[A-Z0-9_]+$/.test(String(k)))return k;
   if(k==='drawingBufferWidth')return Math.round(canvas.width*window.mockBufferScale);
   if(k==='drawingBufferHeight')return Math.round(canvas.height*window.mockBufferScale);
   if(k==='getParameter')return p=>p==='MAX_VIEWPORT_DIMS'?new Int32Array([16384,16384]):16384;
   if(k==='getShaderParameter'||k==='getProgramParameter')return ()=>true;
   if(k==='checkFramebufferStatus')return ()=>'FRAMEBUFFER_COMPLETE';
   if(k==='getUniformLocation')return (_,n)=>n;
   if(String(k).startsWith('create'))return ()=>({});
   return ()=>{};
 }});
};</script>'''
checks=[]
def check(name,value):
 checks.append(dict(name=name,passed=bool(value)));assert value,name
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 errors=[]
 for dpr in [1,1.25,1.5,2,3]:
  page=b.new_page(viewport=dict(width=int(3840/dpr),height=int(2160/dpr)),device_scale_factor=dpr)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html.replace('<head>','<head>'+stub))
  page.wait_for_function('window.__vsualize?.renderer.frames>2');page.evaluate('__vsualize.show();__vsualize.settings.controlsTimeout=0');page.locator('#tab-settings').click()
  page.wait_for_function("document.querySelector('#render-resolution').textContent.includes('3840 × 2160')")
  check(f'readout at {dpr*100}% scaling',page.locator('#render-resolution').inner_text()=='Rendering: 3840 × 2160 · Native · 100%')
  check(f'Native is highest/default choice at {dpr*100}%',page.locator('#quality').input_value()=='high' and page.locator('#quality option[value="high"]').inner_text()=='Native (100%)')
  check(f'no document horizontal overflow at {dpr*100}%',page.evaluate('document.documentElement.scrollWidth===innerWidth'))
  page.locator('#quality').select_option('medium');page.wait_for_function("document.querySelector('#render-resolution').textContent.includes('Reduced')")
  check(f'Balanced is visibly reduced at {dpr*100}%',not 'Native' in page.locator('#render-resolution').inner_text())
  page.locator('#quality').select_option('high');page.wait_for_function("document.querySelector('#render-resolution').textContent.includes('Native')")
  check(f'reselect Native at {dpr*100}%',page.locator('#render-resolution').inner_text()=='Rendering: 3840 × 2160 · Native · 100%')
  if dpr==1:
   page.evaluate('window.mockBufferScale=.5');page.wait_for_function("document.querySelector('#render-resolution').textContent.includes('Graphics limited')")
   check('implementation-smaller buffer is not mislabelled',page.locator('#render-resolution').inner_text()=='Rendering: 1920 × 1080 · Graphics limited · 50% scale')
   page.evaluate('window.mockBufferScale=1')
   for w,h in [(800,600),(300,240),(900,700)]:
    page.set_viewport_size(dict(width=w,height=h));page.wait_for_function(f"document.querySelector('#render-resolution').textContent.includes('{w} × {h}')")
    check(f'readout updates after resize to {w}x{h}',page.evaluate('!__vsualize.renderer.resolution.implementationLimited'))
  page.close()
 check('no uncaught errors',not errors);b.close()
report=dict(WebGL='mocked (sizing/reporting only)',nativeAPI='not tested',passed=len(checks),checks=checks)
(OUT/'ui-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
