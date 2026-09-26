import { writeFileSync } from 'node:fs';
import { DEFAULTS, silentFrame, PALETTES, hexRGB } from '../dist/settings.js';
import { MotionDriver } from '../dist/motion.js';
import { VISUALS } from '../dist/visuals/index.js';
import { VERTEX } from '../dist/visuals/common.js';
const dir=process.argv[2]||'artifacts/response';
const cases={};
const bounds={low:[5,44],mid:[44,89],high:[89,125]};
for(const [name,center] of Object.entries({low:24,mid:66,high:108})) {
 const spectrum=Array.from({length:128},(_,i)=>Math.max(0,.78-((i-Number(center))/11)**2*.4));
 const f={...silentFrame(),volume:.62,spectrum,waveform:Array.from({length:256},(_,i)=>.18*Math.sin(i*(name==='low'?.12:name==='mid'?.49:1.4)))};
 for(const [key,[a,b]] of Object.entries(bounds)) f[key==='low'?'bass':key==='high'?'treble':key]=spectrum.slice(a,b).reduce((a,b)=>a+b,0)/(b-a);
 const d=new MotionDriver();for(let i=0;i<90;i++)d.update(f,DEFAULTS,1/30);
 cases[name]={audio:f,state:{...d.state},spectrum:[...d.response.value.spectrum]};
}
const shaders=Object.values(VISUALS).map(v=>({...v,colors:PALETTES[v.palette==='auto'?'iris':v.palette].colors.map(hexRGB)}));
writeFileSync(`${dir}/cases.json`,JSON.stringify({vertex:VERTEX,defaults:DEFAULTS,shaders,cases},null,2));
