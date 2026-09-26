/** Deterministic control timeline for actual multi-frame shader tests.
 * This is synthetic input, NOT a recording or a native-capture test. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULTS, silentFrame, PALETTES, hexRGB } from '../dist/settings.js';
import { MotionDriver } from '../dist/motion.js';
import { VisualInertia, ImpulseHistory } from '../dist/inertia.js';
import { VISUALS } from '../dist/visuals/index.js';
import { VERTEX } from '../dist/visuals/common.js';
const out=process.argv[2]||'artifacts/motion';mkdirSync(out,{recursive:true});
const fps=30,seconds=12,driver=new MotionDriver(),inertia=new VisualInertia(),impulses=new ImpulseHistory(),frames=[];
let head=0,elapsed=0;
for(let frame=0;frame<fps*seconds;frame++){
 const t=frame/fps,kick=Math.exp(-(t%0.55)*19),snare=Math.exp(-((t+.25)%1.1)*28),hat=Math.exp(-(t%0.1375)*60);
 const phrase=.38+.32*Math.sin(t*.63)**2;
 const f={...silentFrame(),volume:.22+kick*.4,beat:kick};
 f.spectrum=Array.from({length:128},(_,i)=>Math.min(1,
    (.35+kick*.5)*Math.exp(-(((i-21)/12)**2))+phrase*Math.exp(-(((i-63)/14)**2))+(.12+hat*.65+snare*.1)*Math.exp(-(((i-108)/12)**2))));
 f.bass=f.spectrum.slice(5,44).reduce((x,y)=>x+y,0)/39;f.mid=f.spectrum.slice(44,89).reduce((x,y)=>x+y,0)/45;f.treble=f.spectrum.slice(89,125).reduce((x,y)=>x+y,0)/36;
 const state=driver.update(f,DEFAULTS,1/fps),shape=inertia.update(state,driver.response.value.spectrum,1/fps,DEFAULTS.smoothness);
 if(state.event)impulses.push(state.clock,state.eventStrength);
 elapsed+=1/fps;let writes=0;while(elapsed>=1/24){elapsed-=1/24;head=(head+1)%64;writes++;}
 frames.push({t,state:{...state},shape:{...shape},spectrum:[...inertia.spectrum],impulses:[...impulses.data],head,phase:elapsed*24,writes});
}
writeFileSync(`${out}/scenes.json`,JSON.stringify({fps,seconds,vertex:VERTEX,defaults:DEFAULTS,shaders:Object.values(VISUALS).map(v=>({...v,colors:PALETTES[v.palette==='auto'?'iris':v.palette].colors.map(hexRGB)})),frames}));
