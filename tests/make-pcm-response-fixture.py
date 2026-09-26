"""Generate original synthetic PCM, then use the native FFT/display formulas.
This reference fixture exercises feature-to-motion response, not WASAPI calls.
Only the JSON is needed when running the Node unit suite on Windows.
"""
from pathlib import Path
import numpy as np,json
ROOT=Path(__file__).resolve().parents[1];SR=48000;N=2048;duration=10
sample=np.arange(SR*duration)/SR;audio=np.zeros_like(sample)
events=[]
for lane,start,freq in [('bass',1.,93.75),('mid',4.,937.5),('treble',7.,6000.)]:
 for t in [start,start+.5,start+1.,start+1.5]:
  age=sample-t;env=np.where(age>=0,np.exp(-np.maximum(0,age)/(.085 if lane=='bass' else .065)),0)
  audio+=env*.24*np.sin(2*np.pi*freq*age);events.append({'time':t,'band':lane})
window=np.hanning(N);norm=2/window.sum();binHz=SR/N;half=np.exp(np.log(16000/30)/127*.5)
frames=[]
for index in range(duration*30):
 t=index/30;end=int(t*SR);begin=max(0,end-N);pcm=np.zeros(N);segment=audio[begin:end]
 if len(segment):pcm[-len(segment):]=segment
 power=np.abs(np.fft.fft(pcm*window)[:N//2])**2*norm**2
 spectrum=[]
 for band in range(128):
  hz=30*(16000/30)**(band/127);low=max(1,int(np.floor(hz/half/binHz)));high=min(len(power)-1,int(np.ceil(hz*half/binHz)))
  p=float(max(power[low:high+1]))*1.35**2 if low<=high else 0
  spectrum.append(float(np.clip((10*np.log10(p)+72)/65,0,1)) if p>1e-12 else 0.)
 rms=float(np.sqrt(np.mean(pcm**2)));active=rms>.002
 if not active:spectrum=[0.]*128
 volume=float(min(1,np.sqrt(rms*1.35)*1.8)) if active else 0.
 frames.append({'time':t,'volume':round(volume,7),'bass':round(float(np.mean(spectrum[5:44])),7),'mid':round(float(np.mean(spectrum[44:89])),7),'treble':round(float(np.mean(spectrum[89:125])),7),'beat':0,'spectrum':[round(x,6) for x in spectrum]})
(ROOT/'tests/fixtures/pcm-response.json').write_text(json.dumps({'description':'Original 48 kHz mono sine-burst PCM, FFT 2048, Hann window, native max-bin/log display mapping, sensitivity 1.35, gate .002, 30 Hz packets. No device capture.','events':events,'frames':frames}))
