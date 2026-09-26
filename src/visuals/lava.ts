import type { VisualDefinition } from '../types.js';
import * as collection_common_js_1 from './collection-common.js';
export const lava: VisualDefinition = {
    id: "lava",
    name: "Lava Forms",
    subtitle: "Independent frequency layers inflate rising blobs with inertia; midrange shapes their merging",
    palette: "ember",
    category: "Organic",
    cost: "heavy",
    reference: "lava-lamp-3d",
    fragment: collection_common_js_1.COLLECTION + `
float smin(float a,float b,float k) { float h=sat(0.5+0.5*(b-a)/k); return mix(b,a,h)-k*h*(1.0-h); }
float molten(vec3 p) {
  float d=10.0;
  for(int i=0;i<6;i++) {
    float k=float(i),t=uFlow*0.38;
    float rise=-1.45+mod(k*0.51+uTravel*0.43,2.9);
    float life=smoothstep(-1.45,-0.98,rise)*(1.0-smoothstep(0.98,1.45,rise));
    vec3 center=vec3(sin(k*2.3+t*0.67)*0.70,rise,cos(k*1.7+t*0.47)*0.37);
    float radius=0.21+0.065*sin(k*2.0)+spectrum(k/6.0)*0.18*uIntensity+uImpact*0.015;
    radius*=max(life,0.001);
    d=smin(d,length(p-center)-radius,0.15+uMid*0.27);
  }
  return d;
}
void main() {
  vec2 p=sceneUV(); vec3 ro=vec3(0,0,3.5),rd=normalize(vec3(p,-2.5));
  float distance=0.0,d=1.0,nearD=10.0; vec3 q=ro,nearPoint=ro;
  for(int i=0;i<70;i++) {
    if(i>=int(mix(42.0,70.0,uDetail))) break;
    q=ro+rd*distance; d=molten(q); if(d<nearD) {nearD=d;nearPoint=q;} if(d<0.002 || distance>6.0) break; distance+=max(d*0.86,0.002);
  }
  vec3 col=vec3(0);
  if(d<0.01 && distance<6.0) {
    vec2 e=vec2(0.003,0);
    vec3 n=normalize(vec3(molten(q+e.xyy)-molten(q-e.xyy),molten(q+e.yxy)-molten(q-e.yxy),molten(q+e.yyx)-molten(q-e.yyx)));
    vec3 light=normalize(vec3(-0.5,0.9,1.0));
    float diffuse=max(dot(n,light),0.0),rim=pow(1.0-max(dot(n,-rd),0.0),max(0.4,2.0/uLineWidth));
    float spec=pow(max(dot(reflect(-light,n),-rd),0.0),max(1.0,45.0/uLineWidth));
    col=art(q.y*0.21+q.z*0.12+uTime*0.008)*(0.30+diffuse*1.05+rim*(0.8+uGlow*0.45));
    col+=uColorB*spec*(1.25+uTrebleHit*0.7);
    finish(col,0.95); return;
  }
  // A material halo around the actual distance field, not a fullscreen blur.
  float halo=exp(-max(nearD,0.0)/max(0.01,(0.025+uGlow*0.030)*sqrt(uLineWidth)))*uGlow*0.22;
  col=art(nearPoint.y*0.21+nearPoint.z*0.12+uTime*0.008)*halo;
  finish(col,sat(halo));
}`
};
