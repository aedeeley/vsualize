import type { VisualDefinition } from '../types.js';
import * as collection_common_js_1 from './collection-common.js';
export const organism: VisualDefinition = {
    id: "organism",
    name: "Acid Organism",
    subtitle: "Continuously flowing cells; low-frequency pressure, midrange veins and high-frequency edge light",
    palette: "aurora",
    category: "Organic",
    cost: "medium",
    reference: "acid-physarum-amoeba",
    fragment: collection_common_js_1.COLLECTION + `
void main() {
  vec2 p=sceneUV()*2.1; float t=uFlow*0.38;
  vec2 flow=vec2(fbm(p*0.74+vec2(t,0)),fbm(p*0.8+vec2(7,-t)))-0.5;
  vec2 q=p+vec2(t*0.14,-t*0.09)+flow*(1.05+uBass*uIntensity*0.60+uImpact*0.10);
  float n=fbm(q*1.7+vec2(t*0.6,-t*0.4));
  float fine=fbm(q*3.6+flow*2.0);
  float note=spectrum(clamp(n,0.0,1.0));
  float veins=pow(1.0-abs(sin(n*27.0+fine*3.4)),max(0.6,(11.0-note*7.5)/uLineWidth));
  float cell=pow(sat(1.0-abs(n-0.48)*5.5),2.0);
  float rings=pow(0.5+0.5*cos(n*73.0+fine*5.0),14.0/uLineWidth);
  vec3 col=art(n*1.1+fine*0.4+t*0.05)*(veins*(0.8+uMidHit*0.5)+rings*cell*0.45);
  col+=art(n+0.5)*pow(cell,7.0)*(0.12+uMid*0.45);
  float softVeins=pow(1.0-abs(sin(n*27.0+fine*3.4)),max(0.35,2.5/uLineWidth));
  col+=art(n*1.1+fine*0.4+t*0.05)*softVeins*uGlow*0.12;
  col*=0.4+uVolume*uIntensity*1.7;
  paint(col);
}`
};
