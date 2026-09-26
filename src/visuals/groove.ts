import type { VisualDefinition } from '../types.js';
import * as collection_common_js_1 from './collection-common.js';
export const groove: VisualDefinition = {
    id: "groove",
    name: "Groove Current",
    subtitle: "A gliding brush with real trails; smooth bass swells and mid/high edge detail",
    palette: "aurora",
    category: "Organic",
    cost: "light",
    reference: "groove",
    feedback: true,
    fragment: collection_common_js_1.COLLECTION + `
void main() {
  vec2 p=sceneUV(); vec2 center=vec2(sin(uTurn*0.40)*0.39,cos(uFlow*0.32)*0.34);
  vec2 q=rot(uTurn*0.24)*(p-center);
  float a=atan(q.y,q.x),r=length(q),radius=0.17+uBass*uIntensity*0.13+uImpact*0.024;
  float shape=radius*(1.0+(0.07+uMid*0.26)*sin(a*3.0+uTime*0.25)+spectrum(abs(a)/PI)*0.30);
  shape+=sin(a*9.0-uFlow*0.25)*spectrum(abs(a)/PI)*0.012;
  float edge=luminous(r-shape,0.0045);
  vec3 seed=art(a*0.12+uTime*0.018)*edge*(0.8+uVolume+uMidHit*0.25);
  // Sample a gently advected previous frame. Feedback is real, not a time-only echo.
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec2 feedbackUV=(uv-0.5)*(1.0+0.003*uDelta*60.0*uSpeed)+0.5+vec2(0.0030,0.0045)*uDelta*60.0*uSpeed;
  vec4 previous=texture(uFeedback,feedbackUV);
  float inside=step(0.0,feedbackUV.x)*step(feedbackUV.x,1.0)*step(0.0,feedbackUV.y)*step(feedbackUV.y,1.0);
  vec3 fresh=emissiveTone(seed*(0.78+uAudioAccent*0.40),lightExposure());
  vec3 prior=uTransparent>0.5 ? previous.rgb*previous.a/max(uOpacity,0.1) : max(previous.rgb-uBackground,vec3(0));
  vec3 trail=prior*pow(0.993,uDelta*60.0)*inside;
  vec3 light=max(fresh,trail);
  float cover=clamp(brightness(light)*1.08,0.0,1.0);
  fragColor=uTransparent>0.5 ? vec4(clamp(light/max(cover,0.001),0.0,1.0),max(0.005,cover*uOpacity)) : vec4(light+uBackground*(1.0-cover),1.0);
}`
};
