"""Production picker/settings integration. WebGL and native IPC are mocked.
No rendered-effect, Windows-window or live audio validation is claimed.
"""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'focused-library';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'artifacts/preview/vsualize.html').read_text()
native=(ROOT/'tests/live-desktop-ui.py').read_text().split("stub='''",1)[1].split("'''",1)[0]
gl=(ROOT/'tests/response-ui-mocked.py').read_text().split("gl_stub='''",1)[1].split("'''",1)[0]
removed=['orbital','vortex','pulse','chaos','weaver']
names=['Orbital Vortex','Chromatic Vortex','Pulse Tunnel','Chromatic Chaos','Silk Weaver']
aliases=['Hpno+Vortex+Illusio','color-vortex-suck','pulse-warp-tunnel','rainbow-chaos-stars','sound-weaver']
ids=json.loads((ROOT/'tests/fixtures/retained-library-0.2.7.json').read_text())['retainedOrder']
checks=[]
def check(name,value):
 checks.append({'name':name,'passed':bool(value)})
 if not value:raise AssertionError(name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 for retired in removed:
  page=browser.new_page(viewport={'width':860,'height':760});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  saved={'version':1,'audioBehavior':2,'visual':retired,'favorites':['julia',*removed,'ripple'],
    'palette':'ember','mode':'desktop','desktopDevice':'speaker-test','sensitivity':1.9,
    'smoothness':.88,'motion':.42,'background':'transparent','controlsTimeout':0}
  seed='<script>storage.set("vsualize.settings.v1",'+json.dumps(json.dumps(saved))+');</script>'
  page.set_content(html.replace('<head>','<head>'+native+seed+gl))
  page.wait_for_function('window.__vsualize?.renderer.frames>2')
  page.evaluate('window.__vsualize.show();window.__vsualize.renderer.paused=true')
  page.locator('#tab-visuals').click()
  settings=page.evaluate('window.__vsualize.settings')
  check(retired+': falls back to Ripple',settings['visual']=='ripple')
  check(retired+': only retained favorites remain',settings['favorites']==['julia','ripple'])
  check(retired+': preserves devices/colors/response',all(settings[k]==saved[k] for k in ['palette','mode','desktopDevice','sensitivity','smoothness','motion','background']))
  check(retired+': picker is exactly the remaining 21',page.locator('[data-card]').evaluate_all('(els)=>els.map(e=>e.dataset.card)')==ids and page.locator('#library-count').inner_text()=='21 / 21')
  check(retired+': no broken thumbnail',page.locator('[data-visual] img').evaluate_all('(xs)=>xs.length===21&&xs.every(x=>x.complete&&x.naturalWidth>0&&x.src.startsWith("data:image/jpeg"))'))
  if retired=='orbital':
   for query in names+aliases:
    page.locator('#visual-search').fill(query)
    check('removed search returns empty: '+query,page.locator('[data-card]:not([hidden])').count()==0 and page.locator('#empty-library').is_visible() and page.locator('#random-visual').is_disabled())
   for query,expected in [('volumetric-led-field','lattice'),('fractal-orbit-film','julia'),('disolve','dissolution')]:
    page.locator('#visual-search').fill(query)
    check('retained alias: '+query,page.locator('[data-card]:not([hidden])').count()==1 and page.locator('[data-card]:not([hidden])').get_attribute('data-card')==expected)
   page.locator('#visual-search').fill('')
   page.locator('#favorites-only').click()
   check('favorites filter contains only retained choices',page.locator('[data-card]:not([hidden])').evaluate_all('(xs)=>xs.map(x=>x.dataset.card)')==['ripple','julia'])
   page.locator('#random-visual').click()
   check('favorite shuffle moves from Ripple to Julia',page.evaluate('window.__vsualize.settings.visual')=='julia')
   page.locator('#random-visual').click()
   check('favorite shuffle returns to Ripple',page.evaluate('window.__vsualize.settings.visual')=='ripple')
   page.locator('#favorites-only').click()
   page.locator('[data-category="Tunnel"]').click()
   check('Tunnel has only remaining three effects',page.locator('[data-card]:not([hidden])').evaluate_all('(xs)=>xs.map(x=>x.dataset.card)')==['overdrive','dissolution','highway'])
   page.locator('[data-category="All"]').click()
   seen=page.evaluate('''()=>{const seen=[];for(let i=0;i<21;i++){seen.push(window.__vsualize.settings.visual);document.querySelector('#next-visual').click()}return seen}''')
   check('next traverses all 21 and wraps to Ripple',seen==ids and page.evaluate('window.__vsualize.settings.visual')=='ripple')
   page.locator('#previous-visual').click()
   check('previous wraps to Prismatic Highway',page.evaluate('window.__vsualize.settings.visual')=='highway')
   shuffled=page.evaluate('''()=>{const seen=[];for(let i=0;i<100;i++){const old=window.__vsualize.settings.visual;document.querySelector('#random-visual').click();seen.push([old,window.__vsualize.settings.visual])}return seen}''')
   check('100 shuffles stay in current library with no immediate repeats',all(a!=b and b in ids for a,b in shuffled))
   check('one set of custom window buttons preserved',page.locator('.window-actions').count()==1)
   check('4px corners preserved',page.evaluate('getComputedStyle(document.body).clipPath')=='inset(0px round 4px)')
   check('native version label is 0.2.8','Vsualize 0.2.8' in page.locator('#page-settings').text_content())
   page.evaluate('window.__vsualize.hide()');page.keyboard.press('ArrowRight')
   check('keyboard navigation cannot select removed effects',page.evaluate('window.__vsualize.settings.visual') in ids)
  check(retired+': no uncaught frontend errors',not errors)
  page.close()
 browser.close()
report={'checks':checks,'passed':sum(x['passed'] for x in checks),'WebGL':'mocked','nativeIPC':'mocked','liveAudioTested':False,'windowsTested':False}
(OUT/'ui-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
