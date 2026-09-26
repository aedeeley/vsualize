"""Generative palette integration: real shader compilation/pixels in Mesa GLES.
Audio and geometry are held fixed, so only color explains frame differences.
Not Windows, WebView2 or a live audio-capture test.
"""
from pathlib import Path
import json,numpy as np
from PIL import Image
from gles_harness import GLES
root=Path(__file__).resolve().parents[1];out=root/'artifacts/colors'
data=json.loads((out/'color-cases.json').read_text());g=GLES(320,240);reports=[]
f=data['audio'];spectrum=np.array(f['spectrum']);wave=np.array(f['waveform'])
print(g.renderer,g.version,flush=True)

def hue_counts(im):
    rgb=im[:,:,:3].astype(float)/255
    hi=rgb.max(2);lo=rgb.min(2);delta=hi-lo
    mask=(hi>.12)&(delta>hi*.28)
    h=np.zeros_like(hi)
    r,gr,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    d=np.maximum(delta,.00001)
    h=np.where(hi==r,((gr-b)/d)%6,h)
    h=np.where(hi==gr,(b-r)/d+2,h)
    h=np.where(hi==b,(r-gr)/d+4,h)
    counts=np.histogram((h[mask]/6)%1,bins=12,range=(0,1))[0]
    substantial=int((counts>=max(12,int(mask.sum()*.02))).sum())
    return substantial,[int(n) for n in counts],int(mask.sum())

for visual,baseline in zip(data['shaders'],data['baselineShaders']):
    vid=visual['id'];g.program(vid,data['vertex'],visual['fragment']);g.program(vid+'-old',data['vertex'],baseline['fragment'])
    uniforms={'uTime':5,'uClock':4,'uTravel':2,'uTurn':.8,'uFlow':1.5,'uColorShift':.04,'uSpeed':.8,
    'uVolume':.62,'uAudioAccent':.15,'uBass':.6,'uMid':.4,'uTreble':.3,
    'uBassHit':0,'uMidHit':0,'uTrebleHit':0,'uBeat':0,'uImpact':0,'uIntensity':1.1,'uGlow':.55,'uDetail':.6,
    'uTransparent':0,'uOpacity':.94,'uIdle':0,'uRainbow':0,
    'uBackground':[.027,.031,.051],'uDelta':1/30,'uMotion':.65,'uHistoryHead':63,'uHistoryPhase':0,'uImpulses[0]':[-100]*96}
    def draw(frame,transparent=0,opacity=.94,multi=True,old=False):
        uniforms['uMulticolor']=1 if multi else 0
        uniforms['uPalettePhase']=frame['phase'] if multi else 0
        if multi:
            for key,color in zip(['uColorA','uColorD','uColorB','uColorE','uColorC'],frame['colors']):uniforms[key]=color
        else:
            for key,color in zip(['uColorA','uColorB','uColorC'],data['fixedColors']):uniforms[key]=color
        uniforms['uTransparent']=transparent;uniforms['uOpacity']=opacity
        g.reset();return g.draw(vid+('-old' if old else ''),uniforms,spectrum,wave,feedback=visual.get('feedback',False))
    images=[draw(frame) for frame in data['frames']]
    differences=[float(np.mean(np.abs(a[:,:,:3].astype(float)-b[:,:,:3]))) for a,b in zip(images,images[1:])]
    hues=[hue_counts(im) for im in images]
    fixed_before=draw(data['frames'][0],multi=False,old=True)
    fixed_after=draw(data['frames'][0],multi=False)
    fixed_diff=int(np.abs(fixed_before.astype(int)-fixed_after.astype(int)).max())
    transparent=draw(data['frames'][0],1,.94);faded=draw(data['frames'][0],1,.35)
    report={'visual':vid,'compiled':True,'distinctPaletteFrames':len(set(im.tobytes() for im in images))==len(images),
    'adjacentPaletteFrameDifferences':differences,'simultaneousHueSectors':[h[0] for h in hues],
    'minimumColoredPixels':min(h[2] for h in hues),'fixedPaletteMaxPixelDifference':fixed_diff,
    'transparencyWorks':bool(transparent[:,:,3].min()<transparent[:,:,3].max() and faded[:,:,3].mean()<transparent[:,:,3].mean())}
    report['passed']=report['distinctPaletteFrames'] and min(differences)>.1 and min(report['simultaneousHueSectors'])>=3 and fixed_diff<=1 and report['transparencyWorks']
    reports.append(report);print(vid,report,flush=True)
    if vid in ['ripple','julia','glass','lava','spectrum']:
        Image.fromarray(np.concatenate(images[:5],axis=1)).save(out/f'{vid}-multicolor-samples.png')
report={'backend':g.version,'renderer':g.renderer,'method':'Fixed geometry and synthetic audio; only generative palette uniforms vary. Fixed palettes compared to the original common shader. Not Windows/WebView2/live audio.','reports':reports}
(out/'render-report.json').write_text(json.dumps(report,indent=2))
assert all(r['passed'] for r in reports)
