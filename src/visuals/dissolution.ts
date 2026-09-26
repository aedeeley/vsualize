import type { VisualDefinition } from '../types.js';
import * as collection_common_js_1 from './collection-common.js';
export const dissolution: VisualDefinition = {
    id: "dissolution",
    name: "Dissolution",
    subtitle: "Forward passage through crystalline cells; separate bands illuminate stable cracks and facets",
    palette: "iris",
    category: "Tunnel",
    cost: "medium",
    reference: "disolve",
    fragment: collection_common_js_1.COLLECTION + `
void main() {
  vec2 p=sceneUV(); float r=max(length(p),0.02),a=atan(p.y,p.x),depth=-log(r);
  vec2 q=vec2((a+uTurn*0.035)/(2.0*PI)*16.0,depth*4.2+uTravel*0.92);
  q.y+=sin(a*3.0+depth*1.4)*(0.2+uMid*0.16);
  vec2 cell=floor(q),f=fract(q); float first=10.0,second=10.0; vec2 nearest=vec2(0);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    vec2 offset=vec2(float(x),float(y)),id=cell+offset;
    id.x=mod(id.x,16.0);
    vec2 point=vec2(hash(id),hash(id+37.2))*(0.65+spectrum(fract(id.x/16.0))*0.12)+0.075;
    vec2 delta=offset+point-f; float d=dot(delta,delta);
    if(d<first) { second=first;first=d;nearest=delta; } else second=min(second,d);
  }
  float crack=second-first,edge=luminous(crack,0.014+fwidth(crack)*0.40+uMidHit*0.055+uTreble*0.02);
  float shading=0.09+0.13*sat(dot(nearest,vec2(-0.6,0.8))+0.4);
  float fine=pow(1.0-abs(sin(q.x*13.0+q.y*9.0+noise(q*3.0)*4.0)),20.0/uLineWidth)*0.035;
  vec3 col=art(depth*0.10+first*0.16+uTime*0.006)*(shading+edge*(0.63+uMidHit*0.28)+fine);
  col*=smoothstep(0.02,0.16,r)*(0.62+uBass*uIntensity*0.68);
  paint(col);
}`
};
