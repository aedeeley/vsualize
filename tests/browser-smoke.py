"""UI + actual WebGL smoke test. Requires Python Playwright and Chromium.
Runs against set_content; no navigation or native audio/device access is faked.
Only localStorage is stubbed because about:blank has no persistent origin.
"""
from pathlib import Path
import os, json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('VSUALIZE_TEST_OUTPUT', ROOT / 'artifacts' / 'browser'))
OUT.mkdir(parents=True, exist_ok=True)
html = (ROOT / 'Vsualize-Preview.html').read_text(encoding='utf-8')
storage = """<script>const testStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>testStorage.get(k)??null,setItem:(k,v)=>testStorage.set(k,v)}});</script>"""
results=[]
def check(name, truth):
    results.append({'check':name,'passed':bool(truth)})
    if not truth: raise AssertionError(name)

with sync_playwright() as p:
    opts={'headless':True,'args':['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
    if os.environ.get('CHROMIUM_PATH'): opts['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':960,'height':720},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html.replace('<head>','<head>'+storage))
    page.wait_for_function('window.__vsualize?.renderer.frames > 2',timeout=20000)
    # Keep auto-dismiss out of software-GPU timing checks; test it explicitly below.
    page.evaluate('window.__vsualize.settings.quality = "low"; window.__vsualize.settings.controlsTimeout = 0')
    check('21 visualizer cards',page.locator('[data-visual]').count()==21)
    check('one window control row only',page.locator('.window-actions').count()==1 and page.locator('#minimize').count()==1 and page.locator('#fullscreen').count()==1 and page.locator('#close-app').count()==1)
    page.locator('[data-setting="reactivity"]').evaluate('(el)=>{el.value="1.75";el.dispatchEvent(new Event("input",{bubbles:true}))}')
    check('music response adjusts transport setting',page.evaluate('window.__vsualize.settings.reactivity')==1.75)
    page.locator('[data-setting="reactivity"]').evaluate('(el)=>{el.value="1.25";el.dispatchEvent(new Event("input",{bubbles:true}))}')
    check('preview starts with no audio, not synthetic music',page.evaluate('window.__vsualize.settings.mode')=='off')
    check('preview explains disconnected audio','No audio connected' in page.locator('#preview-label').inner_text())
    page.locator('#tab-audio').click(); page.locator('[data-mode="demo"]').click(); page.wait_for_timeout(350)
    check('explicit demo cannot be confused with music','DEMO: not your music' in page.locator('#preview-label').inner_text())
    page.locator('#tab-visuals').click()
    check('native desktop capture is not pretended in browser',page.locator('[data-mode="desktop"]').is_disabled())
    check('native combined capture is disabled in browser',page.locator('[data-mode="both"]').is_disabled())
    for visual in ['ripple','glass','mandelbrot','spectrum']:
        page.evaluate('window.__vsualize.show()')
        page.locator('#tab-visuals').click()
        page.locator(f'[data-visual="{visual}"]').click()
        frames=page.evaluate('window.__vsualize.renderer.frames')
        page.wait_for_function(f'window.__vsualize.renderer.frames > {frames+2}',timeout=20000)
        check(visual+' selected',page.evaluate('window.__vsualize.settings.visual')==visual)
        page.evaluate('window.__vsualize.hide()')
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT/f'{visual}-idle.png'))
    page.evaluate('window.__vsualize.show(); window.__vsualize.renderer.paused=true')
    page.locator('#tab-visuals').click()
    check('all thumbnails embedded and loaded',page.locator('[data-visual] img').evaluate_all('(imgs)=>imgs.length===21 && imgs.every(i=>i.complete&&i.naturalWidth>0&&i.src.startsWith("data:image/jpeg"))'))
    aliases={'volumetric-led-field':'lattice','disolve':'dissolution','fractal-orbit-film':'julia'}
    for query,vid in aliases.items():
        page.locator('#visual-search').fill(query)
        check('search resolves '+query,page.locator('[data-card]:not([hidden])').count()==1 and page.locator('[data-card]:not([hidden])').get_attribute('data-card')==vid)
    page.locator('#visual-search').fill('does-not-exist-012345')
    check('empty search displays a helpful state',page.locator('#empty-library').is_visible())
    check('shuffle disabled for empty search',page.locator('#random-visual').is_disabled())
    page.locator('#visual-search').fill('')
    page.locator('[data-category="Fractal"]').click()
    check('fractal category filters list',page.locator('[data-card]:not([hidden])').count()==5)
    for vid in ['julia','bloom']:
        page.locator(f'[data-favorite="{vid}"]').click()
    page.locator('#favorites-only').click()
    check('favorites and category intersect',page.locator('[data-card]:not([hidden])').count()==2)
    page.locator('[data-visual="julia"]').click()
    page.locator('#random-visual').click()
    check('shuffle selects different visual in filtered pool',page.evaluate('window.__vsualize.settings.visual')=='bloom')
    page.locator('#next-visual').click()
    check('next navigation wraps filtered pool',page.evaluate('window.__vsualize.settings.visual')=='julia')
    page.locator('#previous-visual').click()
    check('previous navigation wraps filtered pool',page.evaluate('window.__vsualize.settings.visual')=='bloom')
    page.wait_for_timeout(250)
    check('favorite settings saved',page.evaluate('Array.from(testStorage.values()).some(v=>{try{return JSON.parse(v).favorites?.includes("julia")}catch{return false}})'))
    page.locator('#favorites-only').click()
    page.locator('[data-category="All"]').click()
    check('reset filters restores all 21',page.locator('[data-card]:not([hidden])').count()==21)
    page.locator('[data-visual="ripple"]').click()
    page.evaluate('window.__vsualize.renderer.paused=false; window.__vsualize.hide()')
    check('idle hides both menu and drag gradient',page.locator('#panel').get_attribute('aria-hidden')=='true' and page.locator('#chrome').get_attribute('aria-hidden')=='true')
    page.locator('#visualizer').click(position={'x':100,'y':200})
    check('click reveals controls',page.locator('#panel').get_attribute('aria-hidden')=='false')
    page.locator('#pause').click()
    frames=page.evaluate('window.__vsualize.renderer.frames'); page.wait_for_timeout(250)
    check('pause stops frame drawing',page.evaluate('window.__vsualize.renderer.frames')==frames)
    page.locator('#pause').click(); page.wait_for_function(f'window.__vsualize.renderer.frames > {frames}', timeout=20000)
    check('resume restarts drawing',page.evaluate('window.__vsualize.renderer.frames')>frames)
    page.locator('#pause').click()  # Keep GPU load out of layout timing assertions.
    page.emulate_media(reduced_motion='reduce')
    page.locator('#tab-settings').click()
    page.locator('[data-background="transparent"]').click()
    check('transparent preview has an explicit sample-backdrop label','Sample backdrop' in page.locator('#preview-label').inner_text())
    for size in [(960,720),(300,240),(1200,320)]:
        page.set_viewport_size({'width':size[0],'height':size[1]})
        for position in ['bottom-right','bottom-center','bottom-left','top-right','top-center','top-left','center']:
            page.evaluate('window.__vsualize.show()')
            page.locator('#menu-position').select_option(position)
            page.wait_for_timeout(230)
            rect=page.locator('#panel').bounding_box()
            check(f'menu fits {size} at {position}',rect['x']>=-1 and rect['y']>=-1 and rect['x']+rect['width']<=size[0]+1 and rect['y']+rect['height']<=size[1]+1)
    page.set_viewport_size({'width':960,'height':720})
    page.locator('#menu-position').select_option('bottom-right')
    page.locator('#timeout').select_option('4')
    page.locator('#visualizer').focus(); page.mouse.move(200,180)
    page.wait_for_timeout(4700)
    check('inactivity hides controls',page.locator('#panel').get_attribute('aria-hidden')=='true')
    page.keyboard.press('Enter')
    check('keyboard can reveal controls',page.locator('#panel').get_attribute('aria-hidden')=='false')
    page.keyboard.press('Escape')
    check('Escape dismisses controls',page.locator('#panel').get_attribute('aria-hidden')=='true')
    page.evaluate('window.__vsualize.show()')
    page.locator('#tab-audio').click(); page.locator('[data-mode="off"]').click()
    page.wait_for_timeout(500)
    check('stop capture produces zero spectrum',page.evaluate('window.__vsualize.audio.frame.spectrum.every(v=>v===0)'))
    page.locator('[data-mode="microphone"]').click(); page.wait_for_timeout(1000)
    check('failed microphone capture never silently enables demo',page.evaluate('window.__vsualize.settings.mode')=='microphone' and 'Demo signal' not in page.locator('#signal-summary').inner_text())
    page.locator('[data-mode="demo"]').click(); page.wait_for_timeout(450)
    page.locator('#tab-visuals').click(); page.locator('[data-visual="ripple"]').click()
    page.locator('#tab-settings').click(); page.locator('[data-background="solid"]').click()
    page.locator('#tab-visuals').click(); page.evaluate('window.__vsualize.renderer.paused=false'); page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT/'ripple-ui.png'))
    check('no uncaught JavaScript errors',len(errors)==0)
    report={'checks':results,'count':len(results),'errors':errors,'nativeTested':False,'storage':'in-memory stub for an originless document; persistence logic separately unit-tested'}
    (OUT/'report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    browser.close()
