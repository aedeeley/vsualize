/** Palette-only preview: actual shaders, fixed synthetic audio and geometry. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {ColorCycle} from '../dist/colors.js';
const out='artifacts/colors';mkdirSync(out,{recursive:true});
const cycle=new ColorCycle(.217),fps=24,seconds=30,frames=[];
for(let i=0;i<fps*seconds;i++) {
 frames.push({time:i/fps,colors:cycle.advance(0).map(c=>[...c]),phase:cycle.phase});
 cycle.advance(1/fps);
}
writeFileSync(`${out}/video-frames.json`,JSON.stringify({fps,seconds,frames}));
