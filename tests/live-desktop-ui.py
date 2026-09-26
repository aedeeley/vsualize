"""Desktop-frontend integration using an explicit mock native IPC channel.
Real Chromium/WebGL/UI, but NO Windows device capture or native-window testing.
"""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts'/'live-ui';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'Vsualize-Preview.html').read_text()
stub='''<script>
const storage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedDiagnostic=text;}}});
window.nativeCalls=[];window.activeChannel=null;
window.health=(r=.12,g=false)=>({rawRms:r,packetAgeMs:0,packets:100,sampleRate:48000,channels:2,gated:g});
window.makeFrame=(active)=>({volume:active?.65:0,bass:active?.5:0,mid:active?.4:0,treble:active?.2:0,beat:active?.7:0,spectrum:Array.from({length:128},(_,i)=>active?.3+.3*Math.sin(i*.2)**2:0),waveform:Array.from({length:256},(_,i)=>active?.4*Math.sin(i*.15):0),desktopLevel:active?.65:0,microphoneLevel:0,desktopStatus:'Listening: Test speakers',microphoneStatus:'Not selected',desktopInput:health(active?.12:0),microphoneInput:health(0)});
window.testFrame=makeFrame(false);
window.__TAURI__={core:{Channel:class {},invoke:async (command,args)=>{
 nativeCalls.push({command,args});
 if(command==='start_audio'){window.activeChannel=args.onFrame;}
 if(command==='stop_audio')window.activeChannel=null;
 if(command==='list_audio_devices')return [{id:'speaker-test',name:'Test speakers',kind:'desktop'},{id:'mic-test',name:'Test microphone',kind:'microphone'}];
}},event:{listen:async()=>()=>{}}};
setInterval(()=>{if(window.activeChannel)window.activeChannel.onmessage(window.testFrame)},33);
</script>'''
checks=[]
def check(name,value):
 checks.append({'name':name,'passed':bool(value)})
 if not value:raise AssertionError(name)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':960,'height':760});errs=[];page.on('pageerror',lambda x:errs.append(str(x)))
 page.set_content(html.replace('<head>','<head>'+stub))
 page.wait_for_function('window.__vsualize?.renderer.frames>2',timeout=30000)
 page.evaluate('window.__vsualize.settings.quality="low"; window.__vsualize.show()');page.locator('#tab-audio').click()
 check('native frontend selects desktop, not demo',page.evaluate('window.__vsualize.settings.mode')=='desktop')
 page.wait_for_function('document.querySelector("#capture-title").textContent==="No sound detected"')
 check('quiet capture not falsely labelled live',page.locator('#audio-proof').get_attribute('data-state')=='quiet')
 check('quiet has no animated spectrum',page.locator('#live-spectrum i').evaluate_all('(xs)=>xs.every(x=>x.style.transform==="scaleY(0)")'))
 page.evaluate('window.testFrame=makeFrame(true)');page.wait_for_function('document.querySelector("#capture-title").textContent.startsWith("LIVE")')
 check('real-frame contract produces LIVE status',page.locator('#audio-proof').get_attribute('data-state')=='live')
 check('raw meter displays physical RMS as dBFS','dBFS' in page.locator('#desktop-raw-value').inner_text())
 check('beat indicator follows captured beat envelope',page.locator('#beat-led').evaluate('(x)=>x.classList.contains("active")'))
 check('live spectrum follows packet data',page.locator('#live-spectrum i').evaluate_all('(xs)=>xs.some(x=>x.style.transform!=="scaleY(0)")'))
 check('only one HTML window control row',page.locator('.window-actions').count()==1)
 for button,action in [('minimize','minimize'),('fullscreen','fullscreen'),('close-app','quit')]:
  before=page.evaluate('window.nativeCalls.length')
  page.locator('#'+button).click()
  check('custom '+button+' dispatches its native command (mock)',page.evaluate('(i)=>window.nativeCalls.slice(i)',before)==[{'command':'window_action','args':{'action':action,'value':None}}])
 page.locator('#copy-diagnostics').click();page.wait_for_function('!!window.copiedDiagnostic')
 data=json.loads(page.evaluate('window.copiedDiagnostic'))
 check('copied diagnostics identify native input and version',data['native'] and data['app']=='Vsualize '+json.loads((ROOT/'package.json').read_text())['version'])
 check('copy does not include recordings or waveform','waveform' not in data)
 page.locator('#compare-audio').click();page.wait_for_timeout(250)
 check('A/B mode visibly states response is off','COMPARISON' in page.locator('#signal-summary').inner_text())
 check('A/B leaves captured meters live',page.locator('#master-level').evaluate('(x)=>x.value')>.5)
 check('A/B removes audio from rendered scene',page.evaluate('window.__vsualize.renderer.motion.state.volume')==0)
 page.locator('#compare-audio').click();page.wait_for_timeout(250)
 check('A/B restores audio-reactive scene',page.evaluate('window.__vsualize.renderer.motion.state.volume')>.4)
 page.evaluate('window.testFrame=makeFrame(false)');page.wait_for_function('window.__vsualize.renderer.motion.state.sleeping',timeout=15000)
 phases=page.evaluate('JSON.stringify(window.__vsualize.renderer.motion.state)');page.wait_for_timeout(500)
 check('music-only mode stops the complete transport in silence',page.evaluate('JSON.stringify(window.__vsualize.renderer.motion.state)')==phases)
 page.evaluate('window.testFrame={...makeFrame(false),desktopInput:health(.001,true)}');page.wait_for_timeout(150)
 check('gate problem is distinguished from no signal','threshold' in page.locator('#capture-title').inner_text())
 page.evaluate('window.testFrame={...makeFrame(false),desktopStatus:"Error: device unplugged. Retrying…"}');page.wait_for_timeout(150)
 check('backend device error surfaces without synthetic fallback',page.locator('#capture-title').inner_text()=='Capture error' and page.evaluate('window.__vsualize.settings.mode')=='desktop')
 page.evaluate('window.__vsualize.hide()');page.wait_for_timeout(150)
 check('capture error remains discoverable with controls hidden',page.locator('#signal-monitor').is_visible())
 page.locator('#signal-monitor').click();page.wait_for_timeout(150)
 check('warning opens the audio panel',page.locator('#page-audio').is_visible())
 page.evaluate('window.testFrame=makeFrame(true)');page.wait_for_timeout(200)
 check('device recovery clears error status',page.locator('#capture-title').inner_text().startswith('LIVE'))
 page.locator('#tab-settings').click();page.locator('#show-signal').check();page.evaluate('window.__vsualize.hide()');page.wait_for_timeout(150)
 check('pinned live monitor remains visible',page.locator('#signal-monitor').is_visible())
 page.locator('#signal-monitor').click();page.locator('#tab-settings').click();page.locator('#show-signal').uncheck();page.evaluate('window.__vsualize.hide()');page.wait_for_timeout(150)
 check('successful capture has no mandatory idle chrome',not page.locator('#signal-monitor').is_visible())
 page.evaluate('window.__vsualize.show()');page.locator('#tab-audio').click();page.locator('[data-mode="demo"]').click();page.wait_for_timeout(400)
 check('demo is unmistakable in native UI','DEMO' in page.locator('#capture-title').inner_text())
 page.evaluate('window.__vsualize.hide()');page.wait_for_timeout(150)
 check('demo label cannot hide with menu',page.locator('#signal-monitor').is_visible() and 'DEMO' in page.locator('#monitor-label').inner_text())
 page.evaluate('window.__vsualize.show()');page.locator('[data-mode="desktop"]').click();page.wait_for_timeout(400)
 page.evaluate('window.testFrame=makeFrame(true)');page.wait_for_timeout(500)
 page.locator('#panel').evaluate('(x)=>{x.scrollTop=0}');page.wait_for_timeout(100)
 page.screenshot(path=str(OUT/'native-ui-simulated-input.png'))
 check('no uncaught JavaScript errors',not errs)
 (OUT/'report.json').write_text(json.dumps({'checks':checks,'count':len(checks),'errors':errs,'windowsCaptureTested':False,'nativeIpc':'explicit mock; not real WASAPI'},indent=2))
 print(json.dumps({'passed':len(checks),'errors':errs}));b.close()
