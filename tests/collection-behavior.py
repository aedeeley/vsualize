"""Deterministic synthetic-audio and alpha tests, not a device-capture test."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'collection'; OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'artifacts/preview/vsualize.html').read_text()
storage="""<script>const testStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>testStorage.get(k)??null,setItem:(k,v)=>testStorage.set(k,v)}});</script>"""
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':256,'height':200},device_scale_factor=1)
 errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content(html.replace('<head>','<head>'+storage));p.wait_for_function('window.__vsualize?.renderer.frames>1',timeout=30000)
 p.evaluate('window.__vsualize.renderer.paused=true')
 ids=p.locator('[data-visual]').evaluate_all('(cards)=>cards.map(c=>c.dataset.visual)')
 reports=[]
 for id in ids:
  out=p.evaluate('''id=>{
    const app=window.__vsualize,r=app.renderer,s=app.settings,gl=r.gl;
    Object.assign(s,{visual:id,quality:'low',background:'solid',palette:'auto',motion:.65,intensity:1.1,glow:.55,idleMotion:true,opacity:.94});
    const frame=on=>({volume:on?.8:0,bass:on?.7:0,mid:on?.6:0,treble:on?.4:0,beat:on?.9:0,
      spectrum:Array.from({length:128},(_,i)=>on?.35+.3*Math.sin(i*.16)**2:0),waveform:Array.from({length:256},(_,i)=>on?.65*Math.sin(i*.17):0)});
    function draw(on,background,opacity=1){
      r.releaseFeedback();r.motion=new r.motion.constructor();r.audioRevision=0;r.inertia.reset();r.impulseHistory.reset();r.lastImpulse=-10;r.historyHead=0;r.historyElapsed=0;
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,r.history);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,128,64,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(128*64*4));
      s.background=background;s.opacity=opacity;r.paused=false;
      const f=frame(on);for(let i=0;i<12;i++)r.render(f,s,1/24);
      if(r.paused)throw new Error('Renderer stopped for '+id);
      const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);r.paused=true;return pixels;
    }
    const quiet=draw(false,'solid'),active=draw(true,'solid'),alpha=draw(true,'transparent'),faded=draw(true,'transparent',.4);
    let change=0,solid=true,amin=255,amax=0,asum=0,fsum=0;
    for(let i=0;i<active.length;i+=4){change+=Math.abs(active[i]-quiet[i])+Math.abs(active[i+1]-quiet[i+1])+Math.abs(active[i+2]-quiet[i+2]);solid=solid&&active[i+3]===255;amin=Math.min(amin,alpha[i+3]);amax=Math.max(amax,alpha[i+3]);asum+=alpha[i+3];fsum+=faded[i+3];}
    return {id,audioPixelDifference:change/(active.length*.75),solidAlpha:solid,alphaMin:amin,alphaMax:amax,alphaMean:asum/(alpha.length/4),fadedAlphaMean:fsum/(alpha.length/4),glError:gl.getError()};
  }''',id)
  out['passed']=out['audioPixelDifference']>.005 and out['solidAlpha'] and out['alphaMin']<out['alphaMax'] and out['fadedAlphaMean']<out['alphaMean'] and out['glError']==0
  reports.append(out);print(json.dumps(out),flush=True)
 (OUT/'behavior-report.json').write_text(json.dumps({'visuals':reports,'jsErrors':errors,'nativeTested':False,'description':'Synthetic frames, fixed initial state, 12 draws per condition. Four conditions per visual: silence/active, solid/transparent, full/faded alpha.'},indent=2))
 assert all(r['passed'] for r in reports) and not errors,'Failed audio/alpha behavior check; inspect behavior-report.json'
 b.close()
