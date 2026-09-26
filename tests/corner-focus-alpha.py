"""Actual Chromium CSS pixels and browser-tab focus transitions, with a 2D probe.
This is NOT a native Windows/WebView2 test and does not execute the Win32 region.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
import io,json,math,os
import numpy as np
root=Path(__file__).resolve().parents[1];out=root/'artifacts/corners';out.mkdir(parents=True,exist_ok=True)
html=(root/'static/index.html').read_text().replace('<link rel="stylesheet" href="./style.css">','<style>'+(root/'static/style.css').read_text()+'</style>').replace('<script type="module" src="./main.js"></script>','')
checks=[];snapshots=[]
def check(name,value,detail=None):
 checks.append({'name':name,'passed':bool(value),'detail':detail})
 if not value: raise AssertionError((name,detail))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=not bool(os.environ.get('DISPLAY')),args=['--no-sandbox'])
 for scale in [1,1.25,1.5,1.75,2]:
  ctx=browser.new_context(viewport={'width':420,'height':340},device_scale_factor=scale)
  page=ctx.new_page();page.set_content(html);other=ctx.new_page();other.set_content('<p>Focus reference tab</p>')
  for target in [page,other]: ctx.new_cdp_session(target).send('Emulation.setFocusEmulationEnabled',{'enabled':False})
  for transparent in [False,True]:
   page.evaluate('''transparent=>{
     let c=document.querySelector('#visualizer');c.width=420;c.height=340;
     let ctx=c.getContext('2d');ctx.clearRect(0,0,420,340);
     ctx.fillStyle=transparent?'rgba(69,140,224,.5)':'rgb(69,140,224)';ctx.fillRect(0,0,420,340);
   }''',transparent)
   for controls in [False,True]:
    page.evaluate('''v=>{document.querySelector('#chrome').classList.toggle('visible',v);document.querySelector('#panel').classList.remove('visible');}''',controls)
    page.wait_for_timeout(300)
    captures=[]
    for focused in [True,False]:
     (page if focused else other).bring_to_front()
     page.wait_for_timeout(100)
     check(f'scale {scale}, focus transition {focused}',page.evaluate('document.hasFocus()')==focused)
     im=Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA');a=np.array(im);h,w=a.shape[:2]
     label=f'scale {scale}, transparent {transparent}, controls {controls}, focused {focused}'
     for side,pixels in [('TL',a[:int(8*scale),:int(8*scale),3]),('TR',a[:int(8*scale),-int(8*scale):,3]),('BL',a[-int(8*scale):,:int(8*scale),3]),('BR',a[-int(8*scale):,-int(8*scale):,3])]:
      check(label+' smooth alpha '+side, np.any((pixels>0)&(pixels<(220 if not transparent else 100))))
     corners=[a[y,x,3].item() for x,y in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]]
     check(label+' all four cutouts completely clear',corners==[0,0,0,0],corners)
     # Compare a conservative host-region cutout to actual CSS rasterization.
     # This validates the coverage contract mathematically, not the Rust binary.
     r=8*scale;removed=[]
     for y in range(math.ceil(r)):
      v=max(r-y-1,0);inset=max(0,math.floor(r-math.sqrt(max(0,r*r-v*v))))
      for x in range(inset):
       removed.extend([a[y,x,3],a[y,w-1-x,3],a[h-1-y,x,3],a[h-1-y,w-1-x,3]])
     maximum=int(max(removed,default=0))
     check(label+' native conservative cutout preserves CSS fringe',maximum<=3,maximum)
     captures.append(a)
     if scale==1 and not transparent:
      im.save(out/('focused-controls.png' if focused and controls else 'unfocused-hidden.png') if ((focused and controls) or (not focused and not controls)) else out/'other-state.png')
      if (focused and controls) or (not focused and not controls): snapshots.append((focused,controls,im.copy()))
    check(f'scale {scale}, transparent {transparent}, controls {controls}, focus has identical pixels',np.array_equal(captures[0],captures[1]))
  # Backdrop demonstration must be inside the clip as well.
  page.evaluate("document.body.classList.add('preview','transparent-preview')")
  im=Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA')
  check(f'scale {scale}, sample backdrop does not fill corners',all(im.getpixel(pos)[3]==0 for pos in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]))
  ctx.close()
 browser.close()
report={'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),'scope':'Actual Chromium raster alpha, browser-tab focus, synthetic 2D fill. Conservative native mask math compared with CSS pixels. No native Windows or WebGL execution.','checks':checks}
(out/'focus-alpha-report.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='checks'}))
# Diagnostic contact sheet of enlarged real browser-captured corners, composited
# over a checkerboard so zero alpha is visible. Not a Windows screenshot.
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
sheet=Image.new('RGB',(940,570),(24,26,32));d=ImageDraw.Draw(sheet)
d.text((28,22),'8px corners: browser alpha verification',font=font,fill='white')
d.text((28,53),'Captured CSS compositing, enlarged 8x. Checkerboard is behind the transparent cutout.',font=small,fill=(171,177,191))
for col,(focused,controls,im) in enumerate(snapshots[:2]):
 x=28+col*462;d.text((x,95),'Controls visible / focused' if focused else 'Controls hidden / unfocused',font=font,fill='white')
 for idx,(side,box) in enumerate([('Top left',(0,0,22,22)),('Top right',(im.width-22,0,im.width,22)),('Bottom left',(0,im.height-22,22,im.height)),('Bottom right',(im.width-22,im.height-22,im.width,im.height))]):
  xx=x+(idx%2)*220;yy=128+(idx//2)*212
  crop=im.crop(box).resize((176,176),Image.Resampling.NEAREST);checker=Image.new('RGBA',crop.size)
  cd=ImageDraw.Draw(checker)
  for py in range(0,176,16):
   for px in range(0,176,16):
    shade=220 if (px//16+py//16)%2 else 160;cd.rectangle((px,py,px+15,py+15),fill=(shade,shade,shade,255))
  sheet.paste(Image.alpha_composite(checker,crop).convert('RGB'),(xx,yy));d.text((xx,yy+183),side,font=small,fill=(186,190,203))
sheet.save(out/'clean-corners-verification.png')
