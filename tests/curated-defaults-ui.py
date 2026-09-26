"""Actual production HTML/JS and Chromium input/storage tests.
WebGL and native IPC are explicit mocks: no Windows, device capture or shader rendering claim.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/curated-defaults';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'Vsualize-Preview.html').read_text()
fixture=json.loads((ROOT/'tests/fixtures/screenshot-defaults-0.2.11.json').read_text())
ids=fixture['order']; keys=['intensity','reactivity','motion','smoothness','glow','palette']
native=(ROOT/'tests/live-desktop-ui.py').read_text().split("stub='''",1)[1].split("'''",1)[0]
gl=(ROOT/'tests/native-resolution-ui.py').read_text().split("stub='''",1)[1].split("'''",1)[0]
gl='\n'.join(x for x in gl.splitlines() if not x.startswith('const storage='))
checks=[];errors=[]
def check(name, value):
 checks.append(dict(name=name,passed=bool(value)))
 if not value:raise AssertionError(name)
def load(page,saved=None,query=''):
 seed='' if saved is None else '<script>storage.set("vsualize.settings.v1",'+json.dumps(json.dumps(saved))+');</script>'
 page.set_content(html.replace('<head>','<head>'+native+gl+seed))
 page.wait_for_function('window.__vsualize?.renderer.frames>2')
 page.evaluate('__vsualize.show();__vsualize.settings.controlsTimeout=0')
 page.locator('#tab-visuals').click()
def current(page):return page.evaluate('window.__vsualize.settings')
def choose(page,id):page.locator(f'[data-visual="{id}"]').evaluate('(e)=>e.click()')
def slider(page,key,val):page.locator('#'+key).evaluate('(e,v)=>{e.value=String(v);e.dispatchEvent(new Event("input",{bubbles:true}))}',val)
def expected(id):return {k:fixture['profiles'][id][k] for k in keys}
def verify(page,id,label):
 s=current(page)
 check(label+': active ID',s['visual']==id)
 check(label+': all screenshot values',all(s[k]==v for k,v in expected(id).items()))
 check(label+': selected card',page.locator(f'[data-visual="{id}"]').get_attribute('aria-pressed')=='true')
 for k in keys[:-1]:
  text=f"{round(s[k]*100)}%" if k in ['smoothness','glow'] else f"{s[k]:.2f}×"
  check(label+': '+k+' value shown',page.locator('#'+k+'-value').inner_text()==text and float(page.locator('#'+k).input_value())==s[k])
 check(label+': Randomize selected',page.locator('[data-palette="randomize"]').get_attribute('aria-pressed')=='true')

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport=dict(width=960,height=900))
 page.on('pageerror',lambda e:errors.append(str(e)))
 prior={'version':1,'audioBehavior':2,'colorBehavior':1,'visual':'julia','favorites':['julia','ripple','highway','lava'],
  'mode':'both','desktopDevice':'speaker-test','microphoneDevice':'mic-test','sensitivity':2.1,'desktopGain':.8,'microphoneGain':1.3,
  'palette':'ice','intensity':.2,'reactivity':.25,'motion':1.8,'smoothness':.99,'glow':.6,'quality':'high','fps':60,'controlsTimeout':0,
  'background':'transparent','opacity':.62,'menuPosition':'bottom-right','gentlePeaks':False,'idleMotion':True}
 load(page,prior)
 s=current(page)
 check('removed selected Julia falls back to Ripple',s['visual']=='ripple')
 check('saved remaining favorites retain order',s['favorites']==['ripple','lava'])
 check('eleven cards in exact retained order',page.locator('[data-card]').evaluate_all('(xs)=>xs.map(x=>x.dataset.card)')==ids)
 check('counter reports 11 / 11',page.locator('#library-count').inner_text()=='11 / 11')
 check('all retained thumbnails decode',page.locator('[data-visual] img').evaluate_all('(xs)=>xs.length===11&&xs.every(x=>x.complete&&x.naturalWidth>0)'))
 check('Space filter gone',page.locator('[data-category="Space"]').count()==0)
 check('audio, quality, window appearance preserved',all(s[k]==prior[k] for k in ['mode','desktopDevice','microphoneDevice','sensitivity','desktopGain','microphoneGain','quality','fps','background','opacity','menuPosition','gentlePeaks','idleMotion']))
 check('one pre-migration backup retained',page.evaluate('JSON.parse(storage.get("vsualize.settings.before-effect-defaults.v1")).visual')=='julia')
 starts=page.evaluate('nativeCalls.filter(c=>c.command==="start_audio").length')
 for id in ids:
  choose(page,id);verify(page,id,id)
 check('visual changes did not restart capture',page.evaluate('nativeCalls.filter(c=>c.command==="start_audio").length')==starts)
 for name in ['Prism Triangles','Luminous Lattice','Neural Constellation','Starflight','Nocturne Cube','Petal Resonance','Iridescent Julia','Fractal Bloom','Spectral Cascade','Prismatic Highway']:
  page.locator('#visual-search').fill(name)
  check('removed search: '+name,page.locator('[data-card]:not([hidden])').count()==0)
 page.locator('#visual-search').fill('')
 choose(page,'ripple'); slider(page,'intensity',2.25);slider(page,'glow',.15)
 page.locator('[data-palette="ice"]').evaluate('(e)=>e.click()')
 choose(page,'glass');verify(page,'glass','Glass unaffected by Ripple edits');slider(page,'motion',1.15)
 choose(page,'ripple');s=current(page)
 check('custom Ripple survives a visual switch',s['intensity']==2.25 and s['glow']==.15 and s['palette']=='ice')
 choose(page,'glass');check('custom Glass survives return',current(page)['motion']==1.15)
 page.locator('#reset-response').click();verify(page,'glass','Reset Glass')
 choose(page,'ripple');s=current(page)
 check('resetting Glass did not reset Ripple',s['intensity']==2.25 and s['glow']==.15 and s['palette']=='ice')
 page.wait_for_timeout(220); saved=page.evaluate('JSON.parse(storage.get("vsualize.settings.v1"))')
 check('saved profile map has exactly eleven entries',list(saved['visualTunings'])==ids)
 page.close()
 page=browser.new_page(viewport=dict(width=960,height=900));page.on('pageerror',lambda e:errors.append(str(e)));load(page,saved)
 s=current(page);check('restart preserves custom active Ripple and does not re-migrate',s['intensity']==2.25 and s['glow']==.15 and s['palette']=='ice' and s['visual']=='ripple')
 choose(page,'glass');verify(page,'glass','Glass defaults after restart')
 choose(page,'ripple');page.locator('#reset-response').click();verify(page,'ripple','Reset Ripple to zero smoothing/glow')
 choose(page,'groove');verify(page,'groove','Groove zeros survive restart')
 page.locator('#favorites-only').click();choose(page,'ripple')
 for n in range(8):
  page.locator('#random-visual').click();id='lava' if n%2==0 else 'ripple'
  check(f'filtered shuffle {n} uses correct profile',current(page)['visual']==id and all(current(page)[k]==v for k,v in expected(id).items()))
 page.locator('#favorites-only').click();choose(page,'ripple');page.evaluate('__vsualize.hide();document.querySelector("#visualizer").focus()')
 for id in ids[1:]+['ripple']:
  page.keyboard.press('ArrowRight');s=current(page)
  check('keyboard navigation applies '+id+' defaults',s['visual']==id and all(s[k]==v for k,v in expected(id).items()))
 page.keyboard.press('ArrowLeft');check('previous keyboard wraps to Lava',current(page)['visual']=='lava')
 page.evaluate('__vsualize.show()');page.locator('#tab-settings').click()
 check('Native (100%) retained',page.locator('#quality').input_value()=='high')
 check('version is 0.2.11','Vsualize 0.2.11' in page.locator('#page-settings').text_content())
 check('one window control row',page.locator('.window-actions').count()==1)
 page.locator('#tab-visuals').click();choose(page,'ripple')
 page.locator('#panel').evaluate('(x)=>{x.scrollTop=0}')
 page.screenshot(path=str(OUT/'ui-mocked.png'))
 check('no uncaught script exceptions',not errors)
 browser.close()
report={'passed':len(checks),'checks':checks,'errors':errors,'graphics':'Explicit WebGL API mock; not shader rendering','native':'Explicit IPC mock; not Windows or live capture'}
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'passed':len(checks),'errors':errors}))
