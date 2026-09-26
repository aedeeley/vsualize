"""Equal loudness, fixed transport: do frequencies change more than global brightness?"""
from pathlib import Path
import json,numpy as np
from PIL import Image
from gles_harness import GLES
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts'/'response'
data=json.loads((OUT/'cases.json').read_text());g=GLES(256,192);reports=[]
print(g.version,g.renderer,flush=True)
for visual in data['shaders']:
 vid=visual['id'];g.program(vid,data['vertex'],visual['fragment']);images=[]
 for name,case in data['cases'].items():
  s=case['state'];a,b,c=visual['colors']
  uniforms={'uTime':5,'uClock':4,'uTravel':2,'uTurn':.8,'uFlow':1.5,'uColorShift':.04,'uSpeed':.8,
   'uVolume':.62,'uAudioAccent':.15,'uBass':s['bass'],'uMid':s['mid'],'uTreble':s['treble'],
   'uBassHit':0,'uMidHit':0,'uTrebleHit':0,'uBeat':0,'uImpact':0,'uIntensity':1.1,'uGlow':.55,'uDetail':.3,
   'uTransparent':0,'uOpacity':.94,'uIdle':0,'uRainbow':int(visual['palette']=='spectrum'),
   'uColorA':a,'uColorB':b,'uColorC':c,'uBackground':[.027,.031,.051],
   'uDelta':1/30,'uMotion':.65,'uHistoryHead':63,'uHistoryPhase':0,'uImpulses[0]':[-100]*96}
  g.reset()
  image=g.draw(vid,uniforms,case['spectrum'],case['audio']['waveform'],feedback=visual.get('feedback',False))
  Image.fromarray(image).save(OUT/f'{vid}-{name}.png');images.append(image)
 # Unit-norm spatial light fields remove a whole-frame exposure multiplier.
 # This is a change measurement, not a claim of perceptual synchronization.
 diff=[]
 for i,j in [(0,1),(0,2),(1,2)]:
  x=images[i][:,:,:3].astype(float).mean(2);y=images[j][:,:,:3].astype(float).mean(2)
  x=x/(np.linalg.norm(x)+1e-9);y=y/(np.linalg.norm(y)+1e-9)
  diff.append(float(np.linalg.norm(x-y)))
 report={'visual':vid,'sameVolume':True,'transportFrozen':True,'attacksDisabled':True,'normalizedSpatialDifferences':diff,'passed':max(diff)>.12,'shaderCompiled':True}
 # Separate alpha test, using the last frequency case. All effects must still composite.
 uniforms['uTransparent']=1;g.reset();alpha=g.draw(vid,uniforms,case['spectrum'],case['audio']['waveform'],feedback=visual.get('feedback',False))[:,:,3]
 uniforms['uOpacity']=.4;g.reset();faded=g.draw(vid,uniforms,case['spectrum'],case['audio']['waveform'],feedback=visual.get('feedback',False))[:,:,3]
 report.update(alphaRange=[int(alpha.min()),int(alpha.max())],alphaRespondsToOpacity=bool(faded.mean()<alpha.mean()))
 report['passed']=report['passed'] and report['alphaRespondsToOpacity'] and bool(alpha.max()>alpha.min())
 reports.append(report);print(json.dumps(report),flush=True)
(OUT/'spatial-report.json').write_text(json.dumps({'method':'Unmodified GLSL ES 300 in Mesa EGL/GLES3 llvmpipe. Same volume/exposure/progression; low/mid/high spectra. Not WebGL or Windows capture validation.','backend':g.version,'reports':reports},indent=2))
assert all(x['passed'] for x in reports),'A preset did not demonstrate spatial frequency response or transparency'
