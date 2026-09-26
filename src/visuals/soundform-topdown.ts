import type { VisualDefinition } from '../types.js';
import * as ripple_family_js_1 from './ripple-family.js';
/** The Soundform height field, seen from a centered camera above the surface.
 * The height calculation intentionally matches Soundform Ripple's existing
 * field, time history, taper and compression. Only its projection changes. */
export const soundformTopdown: VisualDefinition = {
    id: 'soundform-topdown', name: 'Soundform Topdown', category: 'Ripples', cost: 'heavy', palette: 'iris',
    reference: 'overhead top down soundform ripple sound pool centered spectral surface',
    subtitle: 'Directly above the same sound-sculpted surface. Broad low hills, mid ridges and fine high details spread outward beneath a steady centered camera.',
    fragment: ripple_family_js_1.RIPPLE_FAMILY + `
void main() {
  vec2 p=sceneUV();
  float radial=length(p)*2.52;
  // No orbital camera, tilt or phase-dependent camera rotation.
  float theta=atan(p.y,p.x);
  float pixel=5.04/min(uResolution.x,uResolution.y);
  vec3 col=vec3(0.0);
  int rings=int(mix(36.0,76.0,uDetail));
  float stepR=2.32/float(rings), phase=fract(uClock*0.62);
  for(int i=0;i<76;i++) {
    if(i>=rings) break; // Uniform quality choice, not per-fragment divergence.
    float radius=(float(i)+phase+1.0)*stepR;
    float age=radius/0.94;
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
    // A true overhead perspective: elevation brings each ridge closer to the
    // camera and enlarges it radially. Zero height produces a circular plane.
    const float cameraHeight=3.00;
    float projected=radius*cameraHeight/(cameraHeight-h);
    float dist=radial-projected;
    float visibility=smoothstep(0.01,0.13,radius)*(1.0-smoothstep(1.90,2.32,radius));
    float width=max(pixel*0.60,min(fwidth(dist)*0.60,pixel*2.20));
    float ink=sharpContour(dist,width);
    float energy=0.15+low*0.65+mid*0.57+high*0.32;
    // Periodic angular lighting/color avoids a cut across atan's wrap seam.
    float light=0.82+0.18*cos(theta-0.75)*(h/1.50);
    vec3 tint=art(radius*0.17+sin(theta)*0.038+mid*0.025);
    col+=tint*ink*visibility*energy*light*1.22;
  }
  paint(col*1.45);
}`
};
