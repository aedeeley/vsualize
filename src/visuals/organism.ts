import type { VisualDefinition } from '../types.js';
import * as collection_common_js_1 from './collection-common.js';
export const organism: VisualDefinition = {
    id: "organism",
    name: "Acid Organism",
    subtitle: "Morphing cells; bass swells, mids twist and highs ripple the membranes",
    palette: "aurora",
    category: "Organic",
    cost: "medium",
    reference: "acid-physarum-amoeba",
    fragment: collection_common_js_1.COLLECTION + `
void main() {
  vec2 p=sceneUV()*2.1; float t=uFlow*0.82;
  // Integrated transports keep the evolving structure moving forward after
  // attacks. Smoothed bands deform local membranes without rewinding the drift.
  float drive=min(uIntensity,2.2);
  float bass=sat(uBass)*drive, mid=sat(uMid)*drive, high=sat(uTreble)*drive;
  float pressure=sat(uImpact)*drive;
  vec2 drift=p+vec2(t*0.24,-t*0.17);
  vec2 flow=vec2(fbm(drift*0.74+vec2(t*0.46,-t*0.21)),fbm(drift*0.8+vec2(7.0-t*0.32,t*0.38)))-0.5;
  vec2 lobes=vec2(sin(drift.y*1.65+t*0.73),cos(drift.x*1.48-t*0.61));
  vec2 curl=vec2(sin(drift.y*2.4+flow.x*4.0-t),cos(drift.x*2.2+flow.y*4.0+t*0.83));
  vec2 q=drift+flow*(1.65+bass*0.70)+lobes*(0.16+bass*0.34+pressure*0.16);
  q+=curl*(0.10+mid*0.28);
  q+=vec2(sin(q.y*7.0-t*2.1),cos(q.x*6.5+t*1.7))*high*0.055;
  // Counter-flowing noise changes cell topology, not just its screen position.
  float n=fbm(q*1.7+vec2(-t*0.37,t*0.29));
  float fine=fbm(q*3.6+flow*2.0);
  // Retain recent notes, but let the current spectrum catch each new attack.
  float note=spectrum(n)*0.55+pastSpectrum(n,0.12)*0.30+pastSpectrum(n,0.30)*0.15;
  float membrane=n*27.0+fine*(3.4+mid*1.1)+sin(n*12.0+t*0.65)*(0.4+bass*0.55);
  float veins=pow(1.0-abs(sin(membrane)),max(0.6,(11.0-note*3.0-pressure*1.5)/uLineWidth));
  float cell=pow(sat(1.0-abs(n-0.48)*5.5),2.0);
  float rings=pow(0.5+0.5*cos(n*73.0+fine*5.0),14.0/uLineWidth);
  vec3 col=art(n*1.1+fine*0.4+t*0.05)*(veins*(0.8+note*0.5)+rings*cell*0.45);
  col+=art(n+0.5)*pow(cell,7.0)*(0.12+note*0.45);
  float softVeins=pow(1.0-abs(sin(membrane)),max(0.35,2.5/uLineWidth));
  col+=art(n*1.1+fine*0.4+t*0.05)*softVeins*uGlow*0.12;
  col*=0.65+note*uIntensity*1.25;
  paint(col);
}`
};
