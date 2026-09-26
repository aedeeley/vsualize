"""Real WebGL regression: settle every effect after synthetic audio stops."""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts'/'silence';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'Vsualize-Preview.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':160,'height':112});page.set_content(html)
 page.wait_for_function('window.__vsualize?.renderer.frames>2',timeout=30000);page.evaluate('window.__vsualize.renderer.paused=true')
 ids=page.locator('[data-visual]').evaluate_all('(xs)=>xs.map(x=>x.dataset.visual)');reports=[]
 for vid in ids:
  r=page.evaluate('''id=>{
   const app=window.__vsualize,r=app.renderer,s=app.settings,gl=r.gl;
   Object.assign(s,{visual:id,quality:'low',background:'solid',motion:.65,idleMotion:false});
   r.releaseFeedback();r.motion=new r.motion.constructor();r.audioRevision=0;r.inertia.reset();r.impulseHistory.reset();r.lastImpulse=-10;
   const frame=on=>({volume:on?.65:0,bass:on?.6:0,mid:on?.4:0,treble:on?.3:0,beat:on?.7:0,spectrum:Array(128).fill(on?.6:0),waveform:Array(256).fill(on?.2:0)});
   const snap=()=>{const buf=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,buf);return buf;};
   r.paused=false;for(let i=0;i<6;i++)r.render(frame(true),s,.1);
   for(let i=0;i<20;i++)r.render(frame(false),s,.1);
   const stopped=snap(),before=r.motion.state.travel;
   for(let i=0;i<4;i++)r.render(frame(false),s,.1);const later=snap();
   let diff=0;for(let i=0;i<later.length;i++)diff+=Math.abs(stopped[i]-later[i]);
   const stationary=r.motion.state.travel===before,sleeping=r.motion.state.sleeping;
   r.render(frame(true),s,.1);const resumed=r.motion.state.travel>before;
   r.paused=true;
   return {id,pixelChange:diff/later.length,stationary,sleeping,resumed,glError:gl.getError()};
  }''',vid)
  r['passed']=r['pixelChange']==0 and r['stationary'] and r['sleeping'] and r['resumed'] and r['glError']==0
  reports.append(r);print(json.dumps(r),flush=True)
 (OUT/'report.json').write_text(json.dumps({'visuals':reports,'windowsCaptureTested':False,'method':'Synthetic PCM features rendered in Chromium SwiftShader; not real music capture.'},indent=2))
 assert all(x['passed'] for x in reports)
 b.close()
