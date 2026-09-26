import type { VisualDefinition } from '../types.js';
import * as portal_flight_js_1 from './portal-flight.js';
export const mandala: VisualDefinition = {
    id: 'mandala', name: 'Energy Mandala',
    subtitle: 'A fast corridor of unfolding star gates, petals, diamonds and filigree. Bass drives flight; mids open the geometry and highs light the smaller glyphs.',
    palette: 'iris', category: 'Geometry', cost: 'medium', reference: 'energy-unlocked mandala tunnel portal shapes',
    fragment: portal_flight_js_1.PORTAL_FLIGHT + `
void main() {
  vec2 p=sceneUV(); float r=length(p),px=2.0/min(uResolution.x,uResolution.y);
  float travel=uTravel*1.16,spacing=1.12,count=16.0,focal=1.25;
  vec3 col=vec3(0);
  for(int i=0;i<16;i++) {
    float z=gateDepth(float(i),travel,spacing,count);
    float id=gateIdentity(z,travel,spacing);
    float direction=mod(id,2.0)*2.0-1.0;
    // Alternating rings unfold gently; faster movement is FORWARD, not spin.
    float roll=id*0.18+uTurn*0.055*direction;
    vec2 q=rot(roll)*p*z/focal;
    float qr=length(q),a=atan(q.y,q.x),footprint=px*z/focal;
    float life=gateLife(z,spacing*count);
    if(qr<0.33||qr>1.65) continue;
    float band=spectrum(fract(id*0.13+0.14));
    float unfold=0.035*sin(uFlow*0.26+id*0.6)+uMid*0.07;
    float mainRadius=0.97+0.055*cos(a*8.0)+unfold*cos(a*16.0);
    float star=flightInk(qr-mainRadius,footprint);
    float octagon=flightInk(polygon(q,8.0)-(0.88+uBass*0.055),footprint*0.82);
    float petals=flightInk(qr-(0.69+0.095*cos(a*8.0)),footprint*0.72);
    float filigree=flightInk(qr-(1.26+0.025*cos(a*24.0+id*0.3)),footprint*0.65);
    // Eight diamonds and sixteen satellite rings on each passing portal.
    float folded=mod(a+PI/8.0,PI/4.0)-PI/8.0;
    vec2 cell=vec2(cos(folded),sin(folded))*qr-vec2(1.10,0);
    float diamond=flightInk(polygon(rot(0.20*sin(uFlow*0.2+id))*cell,4.0)
                           -(0.065+uMid*0.055),footprint*0.66);
    float smallA=mod(a+PI/16.0,PI/8.0)-PI/16.0;
    vec2 small=vec2(cos(smallA),sin(smallA))*qr-vec2(0.52,0);
    float beads=flightInk(length(small)-(0.021+band*0.025),footprint*0.57);
    float spokes=flightInk(cell.y,footprint*0.65)*smoothstep(0.58,0.68,qr)
                *(1.0-smoothstep(1.20,1.31,qr));
    vec3 gate=art(id*0.075)*(star+octagon*0.58)*(0.25+uBass*uIntensity*0.38)
       +art(id*0.075+0.21)*(petals+diamond*0.80+spokes*0.23)*(0.25+uMid*uIntensity*0.45)
       +art(id*0.075+0.43)*(filigree*0.66+beads)*(0.17+uTreble*uIntensity*0.53);
    float trim=smoothstep(0.33,0.41,qr)*(1.0-smoothstep(1.52,1.65,qr));
    col+=gate*life*trim/(1.0+z*0.026);
  }
  // Light travels along the connecting rails; no camera shake or zoom recoil.
  float a=atan(p.y,p.x),depth=focal/max(r,0.065),world=depth+travel;
  float rail=flightInk(sin(a*8.0+0.08*sin(world*0.65)),max(px/max(r,0.065)*7.0,0.0025));
  col+=art(world*0.04)*rail*(0.018+uMid*0.045)*(1.0-smoothstep(10.0,18.0,depth));
  col*=smoothstep(0.018,0.075,r);
  paint(col*1.12);
}`
};
