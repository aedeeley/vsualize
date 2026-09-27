import type { VisualDefinition } from '../types.js';
import * as ripple_family_js_1 from './ripple-family.js';
export const soundform: VisualDefinition = {
    id: 'soundform', name: 'Soundform Ripple', category: 'Ripples', cost: 'heavy', palette: 'iris',
    reference: 'sound shaped dynamic ripple spectral surface',
    subtitle: 'Sound sculpts the surface: low notes raise broad hills, mids carve moving ridges, highs etch finer detail. Each wave carries its own spectral history.',
    fragment: ripple_family_js_1.RIPPLE_FAMILY + `
uniform float uViewZoom;
void main() {
  vec2 p=sceneUV()/uViewZoom;
  // Frame the same raised contour language as Classic, without its fixed lobes.
  float x=p.x*1.53, y=p.y*1.53+0.20;
  float pixel=3.06/(min(uResolution.x,uResolution.y)*uViewZoom);
  vec3 col=vec3(0.0);
  int rings=int(mix(36.0,76.0,uDetail)*0.70+0.5);
  float stepR=2.32/float(rings), phase=fract(uClock*0.62);
  for(int side=0;side<2;side++) {
    for(int i=0;i<53;i++) {
      if(i>=rings) break;
      float index=side==0?float(rings-1-i):float(i);
      float radius=(index+phase+1.0)*stepR;
      if(abs(x)>=radius) continue;
      float z=sqrt(max(radius*radius-x*x,0.000001))*(side==0?1.0:-1.0);
      float theta=atan(z,x), age=radius/0.94;
      // RGB are independent frequency fields, NOT a volume-scaled sine surface.
      vec4 sampleField=soundFieldRGBA(theta,age);
      vec3 field=sampleField.rgb;
      vec3 adjacent=soundField(theta+0.55,age+0.07);
      float taper=1.0-smoothstep(0.45,2.32,radius);
      float low=field.r, mid=field.g, high=field.b;
      float relief=low*1.18+mid*0.80+high*0.27;
      float valleys=(field.g-adjacent.g)*0.28+(field.b-adjacent.b)*0.14;
      float shaped=mix(sampleField.a,relief+valleys,smoothstep(0.03,0.45,radius));
      float excitation=max(0.0,shaped*uIntensity*taper*0.95);
      float h=1.50*(1.0-exp(-excitation/1.50));
      // A small neutral plane remains, but the raised form comes entirely from sound.
      float projected=z*0.40+h-0.10;
      float dist=y-projected;
      float visibility=smoothstep(0.01,0.13,radius)*(1.0-smoothstep(1.90,2.32,radius));
      // Derivative-aware lines retain their definition at native 4K.
      float width=max(pixel*0.64,min(fwidth(dist)*0.62,pixel*2.20));
      float line=sharpContour(dist,width);
      float facing=side==1?1.0:0.60;
      float energy=0.15+low*0.65+mid*0.57+high*0.32;
      float occlusion=(1.0-smoothstep(-0.016,0.016,dist))*smoothstep(-0.095,-0.020,dist)*visibility;
      col*=1.0-occlusion*0.58;
      vec3 tint=art(radius*0.17+theta*0.038+mid*0.025);
      col+=tint*line*visibility*facing*energy*1.30;
    }
  }
  paint(col*1.45);
}`
};
