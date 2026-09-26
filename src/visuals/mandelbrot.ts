import type { VisualDefinition } from '../types.js';
import * as common_js_1 from './common.js';
export const mandelbrot: VisualDefinition = {
    id: 'mandelbrot', name: 'Mandelbrot Dive', subtitle: 'Steady inward journeys · mids sculpt contour relief and highs illuminate the lace', palette: 'aurora',
    category: 'Fractal', cost: 'heavy',
    fragment: common_js_1.COMMON + `
vec4 voyage(vec2 p, float depth, float leg) {
  // Always zoom inward. Crossfade between finite-precision voyages instead of
  // rewinding the camera or claiming unlimited float32 deep-zoom precision.
  float angle=0.10+leg*0.18;
  p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
  vec2 target=vec2(-0.7436439,0.1318259);
  vec2 center=mix(vec2(-0.55,0.02),target,smoothstep(0.0,2.0,depth));
  vec2 c=center+p/exp(depth+0.35), z=vec2(0.0);
  float iter=0.0, trap=100.0;
  float maxIter=96.0+uDetail*160.0;
  for(int i=0;i<256;i++) {
    if(float(i)>=maxIter) break;
    z=vec2(z.x*z.x-z.y*z.y,2.0*z.x*z.y)+c;
    trap=min(trap,abs(dot(z,z)-0.72));
    if(dot(z,z)>256.0) { iter=float(i); break; }
    iter=float(i)+1.0;
  }
  float escaped=1.0-step(maxIter-1.0,iter);
  float mu=iter+1.0-log2(max(log2(max(length(z),1.001)),0.001));
  float tone=spectrum(fract(mu/52.0));
  float band=0.5+0.5*cos(mu*0.54-uFlow*0.055+tone*0.16);
  float lace=pow(band,max(0.6,(8.0-5.0*tone)/uLineWidth)), glow=exp(-trap*(7.0-3.0*uBass));
  vec3 col=palette(mu*0.017);
  col*=0.25+lace*(0.95+uMid*0.75+tone*0.5)+glow*(0.2+uGlow*0.5);
  col+=uColorB*pow(glow,max(0.6,4.0/uLineWidth))*(0.2+uTreble*0.42+uTrebleHit*0.16);
  float vignette=1.0-smoothstep(0.2,2.0,length(p))*0.6;
  float cover=escaped*(uTransparent>0.5 ? 0.35+lace*0.55 : 0.74+lace*0.26)*vignette;
  return vec4(col,cover);
}
void main() {
  float journey=uTravel*0.28, span=6.0, overlap=0.85;
  float leg=floor(journey/span), phase=mod(journey,span);
  vec4 a=voyage(sceneUV(),phase+overlap,leg);
  if(phase>span-overlap) {
    vec4 b=voyage(sceneUV(),phase-(span-overlap),leg+1.0);
    float mixAmount=smoothstep(span-overlap,span,phase);
    // Mix coverage-weighted light so transparent interiors do not leave ghosts.
    float alpha=mix(a.a,b.a,mixAmount);
    a=vec4(mix(a.rgb*a.a,b.rgb*b.a,mixAmount)/max(alpha,0.001),alpha);
  }
  finish(a.rgb,a.a);
}`
};
