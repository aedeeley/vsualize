"""Render actual current shaders for the local picker using Mesa GLES.
Input is synthetic; this is not desktop capture or a Windows rendering test.
Run export-motion-scenes.mjs first, then scripts/maintenance/generate-thumbnails.py.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from gles_harness import GLES
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'artifacts/motion/scenes.json').read_text())
out=ROOT/'artifacts/collection';out.mkdir(parents=True,exist_ok=True)
g=GLES(360,240)
for v in data['shaders']:
 g.program(v['id'],data['vertex'],v['fragment']);g.reset()
 history=np.zeros((64,128));head=0
 for i,f in enumerate(data['frames'][:121]):
  for _ in range(f['writes']):head=(head+1)%64;history[head]=f['spectrum']
  if i!=120 and not(v.get('feedback',False) and i>=60):continue
  s=f['state'];u={f'u{k[0].upper()}{k[1:]}':s[k] for k in ['time','clock','travel','turn','flow','colorShift','speed','beat','bassHit','midHit','trebleHit']}
  u.update({f'u{k[0].upper()}{k[1:]}':f['shape'][k] for k in ['bass','mid','treble','volume','impact']})
  u.update({'uAudioAccent':s['accent'],'uIntensity':1.1,'uGlow':.55,'uDetail':.6,'uTransparent':0,'uOpacity':.94,'uIdle':0,'uRainbow':int(v['palette']=='spectrum'),'uColorA':v['colors'][0],'uColorB':v['colors'][1],'uColorC':v['colors'][2],'uBackground':[.027,.031,.051],'uDelta':1/30,'uMotion':.65,'uHistoryHead':head,'uHistoryPhase':f['phase'],'uImpulses[0]':f['impulses']})
  image=g.draw(v['id'],u,f['spectrum'],np.zeros(256),history=history,feedback=v.get('feedback',False))
 Image.fromarray(image).save(out/f"{v['id']}.png")
 print(v['id'],flush=True)
