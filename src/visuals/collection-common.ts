import * as common_js_1 from './common.js';
/** Shared mathematical helpers, written for Vsualize. */
export const COLLECTION = common_js_1.COMMON + `
uniform float uRainbow, uDelta, uMotion;
uniform sampler2D uFeedback;
mat2 rot(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
float h1(float n) { return fract(sin(n*127.13)*43758.5453); }
vec2 h2(float n) { return vec2(h1(n+1.3),h1(n+91.7)); }
vec3 h3(float n) { return vec3(h1(n+8.0),h1(n+43.0),h1(n+77.0)); }
vec3 rainbow(float t) {
  vec3 k=abs(fract(vec3(t)+vec3(0.0,0.6666667,0.3333333))*6.0-3.0);
  return mix(vec3(1.0),clamp(k-1.0,0.0,1.0),0.88);
}
vec3 art(float t) { return uRainbow>0.5 ? rainbow(t+uColorShift) : palette(t); }
float luminous(float d,float w) { w=strokeWidth(max(w,0.0006)); return exp(-abs(d)/w)+strokeHalo(d,w); }
float segment(vec2 p,vec2 a,vec2 b) { vec2 q=p-a,v=b-a; return length(q-v*clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0)); }
float polygon(vec2 p,float n) { float a=atan(p.y,p.x)+PI/n; return cos(floor(a/(2.0*PI/n))*(2.0*PI/n)-a+PI/n)*length(p); }
float brightness(vec3 c) { return max(c.r,max(c.g,c.b)); }
void paint(vec3 c) {
  // Emissive light already encodes its falloff. Do not attenuate it a second
  // time when compositing against an opaque background.
  vec3 mapped=emissiveTone(c*(0.78+uAudioAccent*0.40),lightExposure());
  float cover=clamp(brightness(mapped)*1.08,0.0,1.0);
  if(uTransparent>0.5) fragColor=vec4(clamp(mapped/max(cover,0.001),0.0,1.0),max(0.005,cover*uOpacity));
  else fragColor=vec4(mapped+uBackground*(1.0-cover),1.0);
}
float starfield(vec2 p,float t) {
  float v=0.0;
  for(int l=0;l<3;l++) {
    float k=float(l); vec2 q=p*(18.0+k*13.0)+vec2(k*11.7,t*(0.015+k*0.005));
    vec2 cell=floor(q),f=fract(q)-0.5; float n=hash(cell+k*53.1);
    float star=exp(-length(f)*max(45.0,90.0-k*20.0));
    v+=star*step(0.84,n)*(0.25+0.75*pow(0.5+0.5*sin(n*60.0+t*0.2),2.0));
  }
  return v;
}
`;
