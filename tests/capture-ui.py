"""Capture the actual built UI, without fetching external assets."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'browser';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'Vsualize-Preview.html').read_text()
storage="""<script>const testStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>testStorage.get(k)??null,setItem:(k,v)=>testStorage.set(k,v)}});</script>"""
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':1120,'height':840},device_scale_factor=1)
 p.set_content(html.replace('<head>','<head>'+storage))
 p.wait_for_function('window.__vsualize?.renderer.frames>2',timeout=30000)
 p.evaluate('window.__vsualize.settings.quality="low";window.__vsualize.show()')
 p.locator('[data-category="Geometry"]').click()
 p.locator('[data-visual="lattice"]').click()
 p.locator('[data-favorite="lattice"]').click()
 p.locator('#visualizer').focus();p.mouse.move(700,810)
 p.wait_for_timeout(1200)
 p.screenshot(path=str(OUT/'collection-ui.png'))
 p.locator('[data-category="Fractal"]').click();p.locator('[data-visual="petals"]').click()
 p.wait_for_timeout(900)
 p.screenshot(path=str(OUT/'fractal-ui.png'))
 b.close()
