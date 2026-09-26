"""Silent, color-only sample. Fixed scene geometry separates palette change from
camera/audio change. Mesa GLES executes the real effect shaders, not a mockup.
"""
from pathlib import Path
import json,numpy as np,subprocess
from PIL import Image,ImageDraw,ImageFont
from gles_harness import GLES
root=Path(__file__).resolve().parents[1];out=root/'artifacts/colors'
data=json.loads((out/'color-cases.json').read_text());timeline=json.loads((out/'video-frames.json').read_text())
g=GLES(384,360)
for vid in ['ripple','julia']:
 v=next(x for x in data['shaders'] if x['id']==vid);g.program(vid,data['vertex'],v['fragment'])
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
big=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',23)
video=out/'Vsualize-Evolving-Palettes-Sample.mp4'
proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','816x526','-r',str(timeline['fps']),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],stdin=subprocess.PIPE)
f=data['audio'];spectrum=np.array(f['spectrum']);wave=np.array(f['waveform'])
u={'uTime':5,'uClock':4,'uTravel':2,'uTurn':.8,'uFlow':1.5,'uColorShift':.04,'uSpeed':.8,
'uVolume':.62,'uAudioAccent':.15,'uBass':.6,'uMid':.4,'uTreble':.3,'uBassHit':0,'uMidHit':0,'uTrebleHit':0,'uBeat':0,'uImpact':0,'uIntensity':1.1,'uGlow':.55,'uDetail':.6,'uTransparent':0,'uOpacity':.94,'uIdle':0,'uRainbow':0,'uMulticolor':1,'uBackground':[.027,.031,.051],'uDelta':1/24,'uMotion':.65,'uHistoryHead':63,'uHistoryPhase':0,'uImpulses[0]':[-100]*96}
for i,frame in enumerate(timeline['frames']):
 u['uPalettePhase']=frame['phase']
 for key,color in zip(['uColorA','uColorD','uColorB','uColorE','uColorC'],frame['colors']):u[key]=color
 canvas=Image.new('RGB',(816,526),(10,12,18));draw=ImageDraw.Draw(canvas)
 draw.text((18,13),'Vsualize / Evolving palettes',font=big,fill=(233,232,240))
 draw.text((18,46),'Five simultaneous colors. New combinations, continuously blended.',font=small,fill=(169,168,184))
 for x,vid,label in [(16,'ripple','Ripple Classic'),(416,'julia','Iridescent Julia')]:
  g.reset();im=Image.fromarray(g.draw(vid,u,spectrum,wave)).convert('RGB')
  canvas.paste(im,(x,98));draw.text((x,73),label,font=font,fill=(226,222,236))
 for j,c in enumerate(frame['colors']):
  left=16+j*157
  draw.rounded_rectangle((left,469,left+151,488),radius=4,fill=tuple(int(round(v*255)) for v in c))
 draw.text((16,503),'COLOR-ONLY SAMPLE  /  Fixed geometry + synthetic input  /  Silent',font=small,fill=(165,164,176))
 draw.text((737,503),f'{frame["time"]:04.1f}s',font=small,fill=(165,164,176))
 if i in [0,240,480]:canvas.save(out/f'palette-video-{i:04}.png')
 proc.stdin.write(canvas.tobytes())
proc.stdin.close();code=proc.wait()
if code:raise RuntimeError(f'ffmpeg exited {code}')
print(video)
