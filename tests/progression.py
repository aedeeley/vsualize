"""Actual GPU checks for history-driven progress at equal instantaneous audio.
Not a Windows audio-device or native-window test. Only localStorage is stubbed.
"""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'progression';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'artifacts/preview/vsualize.html').read_text()
store="""<script>const store=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}});</script>"""
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':256,'height':200},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html.replace('<head>','<head>'+store))
    page.wait_for_function('window.__vsualize?.renderer.frames>1',timeout=30000)
    page.evaluate('window.__vsualize.renderer.paused=true')
    ids=page.locator('[data-visual]').evaluate_all('(cards)=>cards.map(c=>c.dataset.visual)')
    results=[]
    for visual in ids:
        result=page.evaluate('''id=>{
            const {renderer:r,settings:s}=window.__vsualize,gl=r.gl;
            Object.assign(s,{visual:id,motion:.65,reactivity:1.25,intensity:1.1,idleMotion:true,quality:'low',background:'solid',palette:'auto',opacity:.94});
            const frame={volume:.3,bass:.32,mid:.23,treble:.1,beat:0,spectrum:Array.from({length:128},(_,i)=>.2+.1*Math.sin(i*.1)**2),waveform:Array.from({length:256},(_,i)=>.3*Math.sin(i*.19))};
            function reset(){
                r.releaseFeedback();r.motion=new r.motion.constructor();r.audioRevision=0;r.inertia.reset();r.impulseHistory.reset();r.lastImpulse=-10;r.historyHead=0;r.historyElapsed=0;
                gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,r.history);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,128,64,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(128*64*4));
            }
            function renderSample(historyEnergy){
                reset();
                // Process the earlier audio without GPU draws so this remains a
                // small regression test even for raymarched visuals.
                for(let i=0;i<180;i++){
                    const kick=Math.exp(-(i%30)/5),volume=historyEnergy*(.25+.75*kick);
                    r.motion.update({...frame,volume,bass:volume,mid:volume*.7,treble:volume*.4,beat:i%30===0?historyEnergy:0,spectrum:new Array(128).fill(volume)},s,1/60);
                }
                // Both runs finish on EXACTLY the same 1.5 seconds of sound:
                // transient-only displacement would converge back to the same
                // frame; integrated scene phases retain the earlier momentum.
                for(let i=0;i<90;i++)r.motion.update(frame,s,1/60);
                r.paused=false;
                for(let i=0;i<(id==='groove'?12:4);i++)r.render(frame,s,1/30);
                if(r.paused)throw new Error('Shader failed '+id);
                const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
                gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);r.paused=true;
                return {pixels,travel:r.motion.state.travel};
            }
            const a=renderSample(.08),b=renderSample(.9);let change=0;
            for(let i=0;i<a.pixels.length;i+=4)for(let c=0;c<3;c++)change+=Math.abs(a.pixels[i+c]-b.pixels[i+c]);
            return {id,historyPixelDifference:change/(a.pixels.length*.75),quietTravel:a.travel,loudTravel:b.travel,glError:gl.getError()};
        }''',visual)
        # Spectrum/history effects primarily visualize literal spectrum history;
        # it is intentional that matching recent input can converge for these.
        result['historyRequired']=visual not in ('spectrum','cascade')
        result['passed']=result['loudTravel']>result['quietTravel'] and result['glError']==0 and (not result['historyRequired'] or result['historyPixelDifference']>.01)
        results.append(result);print(json.dumps(result),flush=True)
    (OUT/'report.json').write_text(json.dumps({'checks':results,'errors':errors,'nativeTested':False,'method':'Different earlier audio, identical final 1.5-second signal and identical GPU history; compare resulting rendered phases.'},indent=2))
    assert all(r['passed'] for r in results), 'Progression regression'
    assert not errors,errors
    browser.close()
