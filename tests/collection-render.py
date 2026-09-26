"""Render all presets in WebGL2. Does not validate Windows behavior."""
from pathlib import Path
import json, os, base64, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'collection'; OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'Vsualize-Preview.html').read_text()
store="""<script>const testStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>testStorage.get(k)??null,setItem:(k,v)=>testStorage.set(k,v)}});</script>"""
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':480,'height':380},device_scale_factor=1)
 errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html.replace('<head>','<head>'+store))
 page.wait_for_function('window.__vsualize?.renderer.frames>1',timeout=30000)
 page.evaluate('window.__vsualize.renderer.paused=true; window.__vsualize.hide()')
 ids=page.locator('[data-visual]').evaluate_all('(cards)=>cards.map(c=>c.dataset.visual)')
 ids=[id for id in ids if not os.environ.get("VSUALIZE_VISUAL_IDS") or id in os.environ["VSUALIZE_VISUAL_IDS"].split(",")]
 report=[]
 for id in ids:
  start=time.time()
  result=page.evaluate('''id=>{
    const app=window.__vsualize,r=app.renderer,s=app.settings;
    s.visual=id;s.quality='low';s.background='solid';s.palette='auto';s.intensity=1.1;s.motion=.65;s.glow=.55;
    r.paused=false;r.motion=new r.motion.constructor();r.audioRevision=0;r.inertia.reset();r.lastImpulse=-10;r.impulseHistory.reset();
    for(let i=0;i<(id==='groove'?80:(id==='spectrum'||id==='cascade')?32:8);i++) {
      const phase=(i/24*1.82)%1,kick=Math.exp(-phase*12),hat=Math.exp(-((i/24*7.28)%1)*19);
      const f={volume:.15+kick*.4,bass:.2+kick*.62,mid:.29,treble:.07+hat*.42,beat:kick,
        spectrum:Array.from({length:128},(_,j)=>Math.min(1,.28*Math.exp(-j/75)*(.6+.4*Math.sin(j*.15+i/24*1.3))+kick*.64*Math.exp(-(((j-20)/12)**2))+hat*.33*Math.exp(-(((j-96)/18)**2)))),
        waveform:Array.from({length:256},(_,j)=>(Math.sin(j*.093+i/24*3)*kick+Math.sin(j*.37-i/24*2)*.2)*.55)};
      r.render(f,s,1/24);
    }
    const gl=r.gl, pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let sum=0,bright=0; for(let i=0;i<pixels.length;i+=4) {const v=Math.max(pixels[i],pixels[i+1],pixels[i+2]);sum+=v;if(v>40)bright++;}
    const output={image:document.getElementById('visualizer').toDataURL('image/png'),mean:sum/(pixels.length/4),litFraction:bright/(pixels.length/4),glError:gl.getError(),stopped:r.paused,frames:r.frames};
    r.paused=true;return output;
  }''',id)
  image=base64.b64decode(result.pop('image').split(',')[1]);(OUT/f'{id}.png').write_bytes(image)
  result.update(id=id,seconds=round(time.time()-start,2));report.append(result);print(json.dumps(result),flush=True)
  (OUT/'render-report.json').write_text(json.dumps({'visuals':report,'jsErrors':errors,'nativeTested':False},indent=2))
 (OUT/'render-report.json').write_text(json.dumps({'visuals':report,'jsErrors':errors,'nativeTested':False},indent=2))
 browser.close()
