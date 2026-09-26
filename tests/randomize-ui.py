"""Production UI tests; WebGL and native IPC are explicitly mocked.
The source preview is used only as a way to run the shared desktop frontend.
"""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=root/'artifacts/colors';out.mkdir(parents=True,exist_ok=True)
html=(root/'Vsualize-Preview.html').read_text()
native=(root/'tests/live-desktop-ui.py').read_text().split("stub='''",1)[1].split("'''",1)[0]
gl=(root/'tests/response-ui-mocked.py').read_text().split("gl_stub='''",1)[1].split("'''",1)[0]
checks=[]
def check(name,value):
 checks.append({'name':name,'passed':bool(value)})
 if not value:raise AssertionError(name)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 errors=[]
 def open_page(saved=None):
  page=b.new_page(viewport={'width':860,'height':850})
  page.on('pageerror',lambda e:errors.append(str(e)))
  seed='' if saved is None else '<script>storage.set("vsualize.settings.v1",'+json.dumps(json.dumps(saved))+');</script>'
  page.set_content(html.replace('<head>','<head>'+native+seed+gl))
  page.wait_for_function('window.__vsualize?.renderer.frames>2')
  page.evaluate('window.__vsualize.show()')
  page.locator('#tab-visuals').click()
  return page
 old={'version':1,'audioBehavior':2,'palette':'ice','visual':'julia','favorites':['ripple','julia'],
      'mode':'desktop','desktopDevice':'speaker-test','sensitivity':1.7,'smoothness':.9,'motion':.6,'controlsTimeout':0}
 page=open_page(old)
 check('Randomize is first in the actual UI',page.locator('[data-palette]').first.get_attribute('data-palette')=='randomize')
 check('the new first option has an accessible name',page.get_by_role('button',name='Randomize',exact=True).count()==1)
 check('Randomize is selected after updating old preferences',page.locator('[data-palette="randomize"]').get_attribute('aria-pressed')=='true')
 check('the current color label says Randomize',page.locator('#palette-name').inner_text()=='Randomize')
 check('Randomize explains simultaneous colors and generated palettes', 'five colors' in page.locator('[data-palette="randomize"]').get_attribute('title'))
 check('five live chips appear for Randomize',page.locator('#live-palette span').count()==5 and page.locator('#randomize-details').is_visible())
 check('all nine color choices are available',page.locator('[data-palette]').count()==9)
 s=page.evaluate('window.__vsualize.settings')
 check('update preserves devices, response, favorites and effect',all(s[k]==old[k] for k in ['visual','favorites','mode','desktopDevice','sensitivity','smoothness','motion']))
 check('the curated 21-effect library stays intact',page.locator('[data-card]').count()==21)
 check('8px corners stay intact',page.evaluate('getComputedStyle(document.body).borderTopLeftRadius')=='8px')
 page.wait_for_function('window.activeChannel!==null')
 page.evaluate('window.testFrame=makeFrame(true)')
 page.wait_for_timeout(300)
 hue=page.evaluate('window.__vsualize.renderer.colorCycle.hue')
 page.wait_for_timeout(400)
 check('actual renderer advances color phase while receiving the fixture audio',page.evaluate('window.__vsualize.renderer.colorCycle.hue')!=hue)
 page.locator('#pause').click()
 hue=page.evaluate('window.__vsualize.renderer.colorCycle.hue')
 page.wait_for_timeout(250)
 check('pausing freezes the color cycle',page.evaluate('window.__vsualize.renderer.colorCycle.hue')==hue)
 check('five live chip colors are different',len(set(page.locator('#live-palette span').evaluate_all('(xs)=>xs.map(x=>x.style.backgroundColor)')))==5)
 check('chips show the actual rendered palette, not a separate animation',page.evaluate('''() => {
   const expected=__vsualize.renderer.palettePreview.map(c=>`rgb(${c.map(v=>Math.round(v*255)).join(', ')})`);
   return Array.from(document.querySelectorAll('#live-palette span')).every((e,i)=>e.style.backgroundColor===expected[i]);
 }'''))
 page.locator('#pause').click()
 page.wait_for_timeout(100)
 check('resuming continues color cycling',page.evaluate('window.__vsualize.renderer.colorCycle.hue')!=hue)
 calls=page.evaluate('window.nativeCalls.length')
 page.locator('[data-palette="ember"]').click()
 check('live palette details hide for a fixed palette',not page.locator('#randomize-details').is_visible())
 check('choosing a fixed palette works',page.locator('#palette-name').inner_text()=='Ember')
 page.wait_for_timeout(200)
 check('manual fixed palette is persisted with migration marker',page.evaluate('JSON.parse(storage.get("vsualize.settings.v1")).palette')=='ember' and page.evaluate('JSON.parse(storage.get("vsualize.settings.v1")).colorBehavior')==1)
 saved=page.evaluate('JSON.parse(storage.get("vsualize.settings.v1"))')
 check('palette choice does not restart capture',not page.evaluate('(i)=>nativeCalls.slice(i).some(c=>["start_audio","stop_audio"].includes(c.command))',calls))
 page.locator('[data-palette="auto"]').click()
 check('Visual default remains selectable',page.locator('#palette-name').inner_text()=='Visual default')
 page.locator('[data-palette="randomize"]').click()
 check('live palette details return for Randomize',page.locator('#randomize-details').is_visible())
 for width,height in [(300,240),(420,700),(860,850),(1024,450)]:
  page.set_viewport_size({'width':width,'height':height})
  page.locator('#palettes').scroll_into_view_if_needed()
  boxes=page.locator('[data-palette]').evaluate_all('(xs)=>xs.map(x=>{const b=x.getBoundingClientRect();return [b.left,b.right,b.width]})')
  check(f'color swatches fit {width}x{height}',all(0<=l<r<=width and w>=24 for l,r,w in boxes))
  check(f'first button remains reachable {width}x{height}',page.locator('[data-palette="randomize"]').is_visible())
 page.set_viewport_size({'width':860,'height':850});page.locator('#palettes').scroll_into_view_if_needed()
 page.locator('.palette-section').screenshot(path=str(out/'palette-ui-mocked.png'))
 page.close()
 page=open_page(saved)
 check('a chosen fixed palette survives a fresh app frontend session',page.locator('#palette-name').inner_text()=='Ember')
 check('only Ember is marked selected after restart',page.locator('[data-palette][aria-pressed="true"]').get_attribute('data-palette')=='ember')
 page.locator('#tab-settings').click();page.locator('#reset-settings').click();page.locator('#tab-visuals').click()
 check('appearance reset selects Randomize',page.locator('#palette-name').inner_text()=='Randomize')
 page.close()
 page=open_page()
 check('a clean installation selects Randomize too',page.locator('[data-palette="randomize"]').get_attribute('aria-pressed')=='true')
 check('no uncaught JavaScript errors',not errors)
 page.close();b.close()
report={'passed':sum(x['passed'] for x in checks),'checks':checks,'WebGL':'mocked','nativeIPC':'mocked','windowsTested':False,'realDeviceAudioTested':False}
(out/'ui-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
