import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { ColorCycle } from '../dist/colors.js';
import { demoFrame, PALETTES, hexRGB } from '../dist/settings.js';
import { VISUALS } from '../dist/visuals/index.js';
import { VERTEX, COMMON } from '../dist/visuals/common.js';
const directory = process.argv[2] || 'artifacts/colors';
mkdirSync(directory, { recursive: true });
const cycle = new ColorCycle(.217);
const frames = [];
for (let step=0;step<=120*60;step++) {
  if ([0,180,420,720,1200,2100,3600,7200].includes(step)) frames.push({seconds:step/60,colors:cycle.advance(0).map(c=>[...c]),phase:cycle.phase});
  cycle.advance(1/60);
}
const previousCommon=readFileSync(new URL('./fixtures/fixed-colors-common-0.2.8.glsl',import.meta.url),'utf8');
writeFileSync(`${directory}/color-cases.json`, JSON.stringify({
  vertex:VERTEX,shaders:Object.values(VISUALS),audio:demoFrame(5),frames,
  baselineShaders:Object.values(VISUALS).map(v=>({...v,fragment:previousCommon+v.fragment.slice(COMMON.length)})),
  fixedColors:PALETTES.iris.colors.map(hexRGB)
}));
