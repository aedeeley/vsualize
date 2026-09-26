"""CSS compositing tests using the app's actual HTML/CSS and a 2D canvas fixture.
No production JS, WebGL shaders, Windows capture, or native window behavior is exercised.
"""
from pathlib import Path
import io,json,os
from PIL import Image
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=root/'artifacts/corners';out.mkdir(parents=True,exist_ok=True)
html=(root/'static/index.html').read_text().replace('<link rel="stylesheet" href="./style.css">','<style>'+(root/'static/style.css').read_text()+'</style>').replace('<script type="module" src="./main.js"></script>','')
checks=[]
def check(name,ok,detail=None):
 checks.append({'name':name,'passed':bool(ok),'detail':detail})
 if not ok:raise AssertionError((name,detail))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 for dpr in (1,1.5,2):
  ctx=b.new_context(viewport={'width':640,'height':600},device_scale_factor=dpr);page=ctx.new_page();page.set_content(html)
  for width,height in ((640,600),(300,240),(1024,360)):
   page.set_viewport_size({'width':width,'height':height})
   for mode in ('solid','transparent'):
    page.evaluate('''mode=>{
      const canvas=document.querySelector('#visualizer');
      canvas.width=innerWidth;canvas.height=innerHeight;
      const c=canvas.getContext('2d'); c.clearRect(0,0,innerWidth,innerHeight);
      c.fillStyle=mode==='solid'?'#406890':'rgba(64,104,144,.5)';
      c.fillRect(0,0,innerWidth,innerHeight);
    }''',mode)
    for visible in (False,True):
     prefix=f'{width}x{height}, scale {dpr}, {mode}, controls {visible}'
     page.evaluate('v=>{document.querySelector("#chrome").classList.toggle("visible",v);document.querySelector("#panel").classList.toggle("visible",v)}',visible)
     page.wait_for_timeout(275)
     style=page.evaluate('({radius:getComputedStyle(document.querySelector("#app-surface")).borderTopLeftRadius,clip:getComputedStyle(document.querySelector("#app-surface")).clipPath})')
     check(prefix+' 8 CSS-pixel clip',style=={'radius':'8px','clip':'inset(0px round 8px)'},style)
     image=Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA');w,h=image.size
     corners=[image.getpixel(pos)[3] for pos in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]]
     check(prefix+' outer pixels transparent',all(a<=2 for a in corners),corners)
     if mode=='solid':
      tangent=[image.getpixel(pos)[3] for pos in [(int(9*dpr),0),(w-1-int(9*dpr),0),(0,int(9*dpr)),(w-1,h-1-int(9*dpr))]]
      check(prefix+' corner does not remove straight edges',all(a>=250 for a in tangent),tangent)
     else:
      # Clipping must not change the interior, including an overlay on a small window.
      pos=(int(40*dpr),int((height-20)*dpr))
      page.evaluate('document.querySelector("#app-surface").style.clipPath="none"')
      baseline=Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA')
      page.evaluate('document.querySelector("#app-surface").style.removeProperty("clip-path")')
      check(prefix+' interior unchanged by clipping',image.getpixel(pos)==baseline.getpixel(pos),{'clipped':image.getpixel(pos),'unclipped':baseline.getpixel(pos)})
     if dpr==1 and width==640 and mode=='solid' and visible: image.save(out/'8px-layout-fixture.png')
   actual=page.evaluate('''() => [[5,5],[innerWidth-6,5],[5,innerHeight-6],[innerWidth-6,innerHeight-6]].map(([x,y])=>document.elementFromPoint(x,y)?.dataset.resize)''')
   check(f'{width}x{height}, scale {dpr} resize corner hit targets',actual==['NorthWest','NorthEast','SouthWest','SouthEast'],actual)
   check(f'{width}x{height}, scale {dpr} one control row',page.locator('.window-actions').count()==1)
   page.evaluate('''() => {
     document.body.classList.add('window-fullscreen');
     const c=document.querySelector('#visualizer').getContext('2d');
     c.fillStyle='#406890'; c.fillRect(0,0,innerWidth,innerHeight);
   }''')
   fullscreenStyle=page.evaluate('({radius:getComputedStyle(document.querySelector("#app-surface")).borderTopLeftRadius,clip:getComputedStyle(document.querySelector("#app-surface")).clipPath})')
   check(f'{width}x{height}, scale {dpr} fullscreen is square',fullscreenStyle['radius']=='0px' and fullscreenStyle['clip'] in ('inset(0px)','inset(0px round 0px)'),fullscreenStyle)
   square=Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA');w,h=square.size
   check(f'{width}x{height}, scale {dpr} fullscreen corners are filled',all(square.getpixel(pos)[3]>=250 for pos in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]))
   page.evaluate('document.body.classList.remove("window-fullscreen")')
   check(f'{width}x{height}, scale {dpr} returning to window restores 8px',page.evaluate('getComputedStyle(document.querySelector("#app-surface")).borderTopLeftRadius')=='8px')

  ctx.close()
 b.close()
report={'checks':checks,'passed':sum(x['passed'] for x in checks),'nativeWindowsTested':False,'productionJavaScriptTested':False,'WebGLTested':False,'testScope':'CSS compositing with a 2D canvas fixture; shaders and native Windows are not exercised.','deviceScaleFactors':[1,1.5,2]}
(out/'layout-report.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='checks'}))
