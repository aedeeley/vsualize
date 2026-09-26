"""Render real shader sequences with independent synthetic band envelopes.
Tests actual GLSL, not a mocked graphics API. Mesa GLES is NOT Windows WebView2.
Use --clips for higher-resolution silent frame sequences for manual review.
"""
from pathlib import Path
import json,sys,os,numpy as np
from PIL import Image
from gles_harness import GLES
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts'/'motion';data=json.loads((OUT/'scenes.json').read_text())
clips='--clips' in sys.argv;g=GLES(400,480) if clips else GLES(192,144);reports=[]
selection=os.environ.get('VSUALIZE_VISUAL_IDS','ripple,julia').split(',') if clips else [v['id'] for v in data['shaders']]
for v in data['shaders']:
 if v['id'] not in selection:continue
 vid=v['id'];g.program(vid,data['vertex'],v['fragment']);g.reset();history=np.zeros((64,128));frames=[];head=0
 if clips:(OUT/vid).mkdir(exist_ok=True)
 for i,f in enumerate(data['frames']):
  for j in range(f['writes']):head=(head+1)%64;history[head]=f['spectrum']
  if not clips and (i<60 or i>=150):continue
  if clips and i>=150:break
  if clips and (OUT/vid/f'{i:04}.png').exists():continue
  s=f['state'];u={f'u{k[0].upper()}{k[1:]}':s[k] for k in ['time','clock','travel','turn','flow','colorShift','speed','beat','bassHit','midHit','trebleHit']}
  u.update({f'u{k[0].upper()}{k[1:]}':f['shape'][k] for k in ['bass','mid','treble','volume','impact']})
  u.update({'uAudioAccent':s['accent'],'uIntensity':1.1,'uGlow':.55,'uDetail':.6,'uTransparent':0,'uOpacity':.94,'uIdle':0,'uRainbow':int(v['palette']=='spectrum'),'uColorA':v['colors'][0],'uColorB':v['colors'][1],'uColorC':v['colors'][2],'uBackground':[.027,.031,.051],'uDelta':1/30,'uMotion':.65,'uHistoryHead':head,'uHistoryPhase':f['phase'],'uImpulses[0]':f['impulses']})
  image=g.draw(vid,u,f['spectrum'],np.zeros(256),history=history,feedback=v.get('feedback',False))
  frames.append(image)
  if clips:Image.fromarray(image).save(OUT/vid/f'{i:04}.png')
 if clips:continue
 a=np.array(frames,dtype=np.float32)[:,:,:,:3];delta=np.abs(np.diff(a,axis=0)).mean((1,2,3))
 row={'visual':vid,'frames':len(frames),'compiled':True,'moving':bool(delta.max()>.05),'meanFrameChange':float(delta.mean()),'maxFrameChange':float(delta.max()),'glErrors':0}
 reports.append(row);print(json.dumps(row),flush=True)
checks=[]
for vid in ['julia','bloom','mandelbrot']:
 v=next(x for x in data['shaders'] if x['id']==vid)
 if vid not in g.programs:g.program(vid,data['vertex'],v['fragment'])
 u.update(uTransparent=1,uTravel=5.0,uFlow=1.5,uTime=5,uTurn=.2,uColorShift=.03)
 image_a=g.draw(vid,{**u,'uBass':0,'uMid':0,'uTreble':0},np.zeros(128),np.zeros(256))
 image_b=g.draw(vid,{**u,'uBass':.8,'uMid':.4,'uTreble':.6},np.ones(128)*.5,np.zeros(256))
 if vid in ['julia','bloom']:
  unchanged=np.array_equal(image_a[:,:,3],image_b[:,:,3]);checks.append({'name':vid+' geometry does not jump with band changes at fixed camera','passed':unchanged});assert unchanged
 # Compare VISIBLE premultiplied light, not irrelevant RGB under zero alpha.
 # Julia detail naturally changes under tiny motion, so compare the seam to
 # equal-size ordinary steps immediately on either side, not to a static image.
 span=6 if vid=='mandelbrot' else 5.5;rate=.28 if vid=='mandelbrot' else .30
 def visible(image):
  a=image[:,:,3:4].astype(float)/255
  return np.concatenate([image[:,:,:3].astype(float)*a,image[:,:,3:4].astype(float)],axis=2)
 def difference_at(base):
  images=[g.draw(vid,{**u,'uTravel':base+offset},np.ones(128)*.4,np.zeros(256)) for offset in [-.0001,.0001]]
  return float(np.abs(visible(images[0])-visible(images[1])).mean())
 seam=difference_at(span/rate)
 regular=max(difference_at(span/rate-.02),difference_at(span/rate+.02))
 passed=seam<=regular*2.0+.5
 checks.append({'name':vid+' journey crossfade joins without a reset','visibleDifference':seam,'adjacentOrdinaryStepDifference':regular,'passed':passed})
 assert passed,checks[-1]

if not clips:
 assert all(r['moving'] for r in reports)
 (OUT/'temporal-report.json').write_text(json.dumps({'backend':g.version,'renderer':g.renderer,'input':'synthetic multi-band timeline','nativeCaptureTested':False,'reports':reports,'checks':checks},indent=2))
