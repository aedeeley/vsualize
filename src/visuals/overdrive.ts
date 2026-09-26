import type { VisualDefinition } from '../types.js';
import * as collection_common_js_1 from './collection-common.js';
export const overdrive: VisualDefinition = {
    id: "overdrive",
    name: "Neon Overdrive",
    subtitle: "Portals stream past you; bass supplies thrust, mids open scallops and highs light edges",
    palette: "neon",
    category: "Tunnel",
    cost: "light",
    reference: "cyber-punk-punch",
    fragment: collection_common_js_1.COLLECTION + `
void main() {
  vec2 p=sceneUV(); float r=max(length(p),0.005),a=atan(p.y,p.x);
  float l=log(r),time=uTravel*1.3;
  float lobes=(0.06+uBass*0.10+uImpact*0.035)*cos(a*5.0+uTurn*0.12)+(0.025+uMid*0.05)*cos(a*10.0-time*0.22);
  lobes+=spectrum(abs(a)/PI)*0.10;
  float coord=(l-lobes)*5.8-time;
  float d=abs(sin(coord*PI)); float aa=max(fwidth(coord)*1.8,0.025);
  float line=luminous(d,0.025+aa*0.4+uTreble*0.08);
  float alt=0.5+0.5*cos(floor(coord)*PI);
  vec3 tint=mix(uColorA,uColorB,alt);
  vec3 col=tint*line*(0.7+uBass*uIntensity*0.65+uBassHit*0.45);
  col+=uColorC*luminous(abs(sin((coord+0.18)*PI)),0.035)*0.12;
  col*=smoothstep(0.015,0.10,r);
  paint(col);
}`
};
