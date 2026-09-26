import type { VisualDefinition } from '../types.js';
import * as common_js_1 from './common.js';
export const spectrum: VisualDefinition = {
    id: 'spectrum', name: 'Spectrum Field', subtitle: 'Live frequency heights · sustained notes leave ridges behind', palette: 'ice',
    category: 'Spectrum', cost: 'medium',
    fragment: common_js_1.COMMON + `
void main() {
  vec2 p=gl_FragCoord.xy/uResolution*2.0-1.0;
  p.y*=1.18;
  vec3 col=vec3(0.0);
  float coverage=0.0;
  float px=2.0/uResolution.y;
  for(int i=47;i>=0;i--) {
    float depth=(float(i)+uHistoryPhase)/48.0;
    float width=mix(1.08,0.30,depth);
    float x=p.x/width;
    float f=x*0.5+0.5;
    float row=mod(uHistoryHead-float(i)+64.0,64.0);
    float a=texture(uHistory,vec2(clamp(f,0.0,1.0),(row+0.5)/64.0)).r;
    float base=mix(-0.74,0.51,depth);
    float y=base+a*(0.90-depth*0.32)*uIntensity;
    y+=sin(x*3.0+uTime*0.35-depth*4.0)*0.012*uIdle;
    float d=abs(p.y-y);
    float fade=(1.0-smoothstep(0.91,1.02,abs(x)))*(1.0-depth*0.72);
    float line=(1.0-smoothstep(strokeWidth(px*0.55),strokeWidth(px*1.5),d))*fade;
    float halo=(strokeHalo(d,strokeWidth(px*0.7))+exp(-d/(0.007+uGlow*0.009))*0.07*uGlow)*fade;
    vec3 tint=palette(depth*0.45+f*0.24+uTime*0.005);
    float light=(line+halo)*(0.28+a*1.5);
    col+=tint*light;
    coverage=max(coverage,(line+halo)*(0.4+a));
  }
  // A smoothed spectral trace threads the front edge; raw PCM phase cannot shake it.
  float wy=-0.91+spectrum((p.x+1.0)*0.5)*0.16;
  float wl=exp(-abs(p.y-wy)/strokeWidth(max(px,0.0015)))*(1.0-smoothstep(0.85,1.0,abs(p.x)));
  col+=uColorB*wl*(0.4+uMid)*uVolume;
  finish(col,sat(coverage+wl*0.4*uVolume));
}`
};
