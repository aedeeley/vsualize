import type { VisualDefinition } from '../types.js';
import * as common_js_1 from './common.js';
export const glass: VisualDefinition = {
    id: 'glass', name: 'Liquid Glass', subtitle: 'Persistent outward splashes · smooth mid-frequency swells and high-frequency surface detail', palette: 'ice',
    category: 'Ambient', cost: 'medium',
    fragment: common_js_1.COMMON + `
float surface(vec2 p) {
  float h=sin(p.x*3.7+uFlow*0.75)*cos(p.y*4.4-uFlow*0.6)*0.028*uIdle;
  float r=length(p);
  h+=sin(p.x*12.0+p.y*7.0-uFlow*1.2)*uMid*0.036*exp(-r*0.7);
  h+=sin(p.x*29.0-p.y*21.0-uFlow*1.8)*uTreble*0.010*exp(-r*0.8);
  h+=sin(p.x*8.0-p.y*3.0-uFlow*0.4)*spectrum(clamp(p.x*0.25+0.5,0.0,1.0))*0.018*exp(-r*0.7);
  h+=sin(r*19.0-uTravel*4.5)*(0.010*uIdle+uBass*0.065+uImpact*0.025)*exp(-r*0.65);
  for(int i=0;i<24;i++) {
    float age=uClock-uImpulses[i].x;
    if(age>=0.0 && age<4.8) {
      float d=length(p-uImpulses[i].zw*0.45)-age*0.42;
      h+=sin(d*24.0)*exp(-d*d*7.0)*exp(-age*0.6)*uImpulses[i].y*0.19*uIntensity*smoothstep(0.0,0.12,age)*(1.0-smoothstep(3.4,4.8,age));
    }
  }
  return h;
}
void main() {
  vec2 p=sceneUV()*1.2;
  float h=surface(p);
  float e=0.009;
  vec3 n=normalize(vec3((h-surface(p+vec2(e,0.0)))/e,(h-surface(p+vec2(0.0,e)))/e,1.0));
  vec3 eye=normalize(vec3(p*0.25,2.2));
  vec3 l1=normalize(vec3(-0.7,0.9,1.0));
  vec3 l2=normalize(vec3(0.8,-0.45,0.7));
  float spec1=pow(max(dot(reflect(-l1,n),eye),0.0),max(1.0,22.0/uLineWidth));
  float spec2=pow(max(dot(reflect(-l2,n),eye),0.0),max(1.0,46.0/uLineWidth));
  float fresnel=pow(1.0-max(dot(n,eye),0.0),1.6);
  float ridge=pow(sat(length(n.xy)*1.6),2.0);
  float caustic=pow(0.5+0.5*sin((p.x*n.x+p.y*n.y)*17.0+h*48.0),max(1.0,18.0/uLineWidth))*ridge;
  vec3 col=palette(h*2.0+length(p)*0.11+uTime*0.009)*(ridge*0.65+fresnel*2.5);
  col+=uColorB*spec1*(1.2+uGlow)+uColorC*spec2*1.7;
  col+=uColorA*caustic*(0.35+uTreble*0.6)+uColorB*attackRings(length(p),0.42,0.024)*0.18;
  float sheen=pow(max(dot(reflect(-l1,n),eye),0.0),max(0.6,3.5/uLineWidth))*uGlow*0.19;
  col+=uColorB*sheen;
  float edges=1.0-smoothstep(0.65,1.7,length(p));
  float brightness=ridge*0.65+spec1*0.9+spec2+fresnel+sheen;
  finish(col*edges,sat(brightness*edges));
}`
};
