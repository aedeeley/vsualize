"""Actual offscreen GLES shader test, NOT Windows/WebView2 or a speed benchmark.
Generate input first: node tests/export-motion-scenes.mjs artifacts/native4k
"""
from pathlib import Path
import json,ctypes as C,time,numpy as np
from PIL import Image,ImageDraw,ImageFont
from gles_harness import GLES
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/native4k'
data=json.loads((OUT/'scenes.json').read_text());f=data['frames'][100]
history=np.zeros((64,128));head=0
for old in data['frames'][:101]:
 for _ in range(old['writes']):head=(head+1)%64;history[head]=old['spectrum']
s=f['state'];u={f'u{k[0].upper()}{k[1:]}':s[k] for k in ['time','clock','travel','turn','flow','colorShift','speed','beat','bassHit','midHit','trebleHit']}
u.update({f'u{k[0].upper()}{k[1:]}':f['shape'][k] for k in ['bass','mid','treble','volume','impact']})
u.update(uAudioAccent=s['accent'],uIntensity=1.1,uGlow=.2,uDetail=1,uTransparent=0,uOpacity=.94,uIdle=0,uRainbow=0,uBackground=[.027,.031,.051],uDelta=1/30,uMotion=.65,uHistoryHead=head,uHistoryPhase=f['phase'])
u['uImpulses[0]']=f['impulses']
u.update(uMulticolor=1,uPalettePhase=.15,uColorA=[.15,.8,1],uColorD=[.18,1,.3],uColorB=[1,.75,.12],uColorE=[1,.17,.28],uColorC=[.8,.16,1])
checks=[];reports=[]
def check(name,passed,**details):
 checks.append(dict(name=name,passed=bool(passed),**details));assert passed,name
small=GLES(1520,855);v=next(x for x in data['shaders'] if x['id']=='ripple');small.program(v['id'],data['vertex'],v['fragment'])
old=small.draw('ripple',u,f['spectrum'],np.zeros(256),history=history)
old_big=Image.fromarray(old).resize((3840,2160),Image.Resampling.BILINEAR);old_big.save(OUT/'ripple-old-upscaled-4k.png')
g=GLES(3840,2160)
g.e.eglQuerySurface.restype=C.c_uint;g.e.eglQuerySurface.argtypes=[C.c_void_p,C.c_void_p,C.c_int,C.POINTER(C.c_int)]
w=C.c_int();h=C.c_int();g.e.eglQuerySurface(g.display,g.surface,0x3057,C.byref(w));g.e.eglQuerySurface(g.display,g.surface,0x3056,C.byref(h))
check('actual EGL surface is 3840 x 2160',w.value==3840 and h.value==2160,width=w.value,height=h.value)
for v in data['shaders']:
 g.program(v['id'],data['vertex'],v['fragment']);check(v['id']+' unmodified shader compiles',True)
for vid in ['ripple','julia','spectrum','groove']:
 v=next(x for x in data['shaders'] if x['id']==vid);g.reset();t=time.monotonic()
 image=g.draw(vid,u,f['spectrum'],np.zeros(256),history=history,feedback=v.get('feedback',False))
 Image.fromarray(image).save(OUT/f'{vid}-native-4k.png')
 check(vid+' has actual 4K pixel output',image.shape==(2160,3840,4) and int(np.ptp(image[:,:,:3]))>40)
 reports.append(dict(visual=vid,width=3840,height=2160,glErrors=0,nonUniform=True))
 if vid=='ripple':
  native=Image.fromarray(image);alpha=g.draw(vid,{**u,'uTransparent':1},f['spectrum'],np.zeros(256),history=history)
  check('Ripple transparency survives native 4K',int(alpha[:,:,3].min())<10 and int(alpha[:,:,3].max())>50)
 print(vid,'native 4K passed',round(time.monotonic()-t,2),'seconds including readback/save',flush=True)
box=(1536,864,2304,1296);comparison=Image.new('RGB',(1536,506),'#101115');d=ImageDraw.Draw(comparison)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
for x,title,img in [(0,'Before: 1520 × 855 enlarged to 4K',old_big),(768,'After: native 3840 × 2160',native)]:
 d.text((x+16,16),title,font=font,fill='#f0f0f4');comparison.paste(img.crop(box).convert('RGB'),(x,64))
comparison.save(OUT/'native-4k-comparison.png')
report=dict(backend=g.version,renderer=g.renderer,input='synthetic fixed multi-band snapshot',checks=checks,renders=reports,windowsTested=False,webglTested=False,nativeAudioTested=False,performanceClaim='Software offscreen render/readback only; no target-GPU frame-rate claim.')
(OUT/'gles-report.json').write_text(json.dumps(report,indent=2));print('Checks:',len(checks),flush=True)
