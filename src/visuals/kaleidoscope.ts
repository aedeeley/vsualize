import type { VisualDefinition } from '../types.js';
import * as collection_common_js_1 from './collection-common.js';
import { DRAWINGS } from './kaleidoscope-drawings.js';
import { DRAWING_LAYOUT } from './kaleidoscope-layout.js';
/** An illustrated cylindrical surface. Drawings are seeded by their location,
 * so travel discovers new compositions without rerolling visible marks. */
export const kaleidoscope: VisualDefinition = {
    id: 'kaleidoscope', name: 'Cosmic Kaleidoscope',
    subtitle: 'An endless illustrated cosmos: forty kinds of animals, botanicals, celestial forms and symbols unfold in layered constellations of ink.',
    palette: 'iris', category: 'Fractal', cost: 'medium', reference: 'galactic-kaleidoscope psychedelic smooth spinning connected infinite tunnel flight',
    fragment: collection_common_js_1.COLLECTION + `
float threadInk(float d,float footprint) {
  float w=strokeWidth(max(footprint*0.60,0.00035));
  float core=exp(-0.5*(d/w)*(d/w));
  float glow=strokeHalo(d,w)*0.75;
  // Fade unresolvable pattern detail before it becomes a flickering white mass.
  return (core+glow)*(1.0-smoothstep(0.12,0.45,footprint));
}
float drawingInk(float d,float footprint) {
  // Account for the tunnel's directional stretch so a curved contour has
  // consistent screen-space weight on its sides, ends and diagonal strokes.
  // Unsigned distance derivatives cancel on a line centered between pixels;
  // retain a conservative pixel floor so verticals and joins cannot disappear.
  float pixel=clamp(length(vec2(dFdx(d),dFdy(d))),footprint*0.65,footprint*1.5);
  float width=strokeWidth(max(pixel*0.85,0.00015));
  float coverage=1.0-smoothstep(max(0.0,width-pixel*0.65),width+pixel*0.65,d);
  return (coverage+strokeHalo(d,width)*0.22)*(1.0-smoothstep(0.04,0.16,footprint));
}
${DRAWINGS}
${DRAWING_LAYOUT}
void main() {
  float variety=1.0;
  vec2 p=sceneUV();
  float r=length(p);
  // Both clocks are integrated and eased by the transport. Neither is a live
  // volume offset, so a released note cannot reverse rotation or camera travel.
  float roll=uClock*0.13+uTurn*0.62;
  float a=atan(p.y,p.x)+roll;
  float wall=1.0+0.085*cos(a*8.0)+0.025*cos(a*16.0+uFlow*0.045);
  float depth=1.32*wall/max(r,0.032);
  float world=depth+uTravel*0.68;
  float twist=world*0.17+0.12*sin(world*0.34-uFlow*0.12);
  float angle=a+twist;
  // Over a 2PI angular wrap, x changes by 8 and y by -1. All visible terms
  // are periodic on those increments, so there is no seam down the tunnel.
  float x=angle*8.0/(2.0*PI);
  float y=world/1.55-angle/(2.0*PI);
  x+=0.070*sin(2.0*PI*y);
  y+=0.045*sin(2.0*PI*x);
  float sx=abs(sin(PI*x)), sy=abs(sin(PI*y));
  // Signed sines retain useful gradients at zero crossings; an analytic
  // pixel floor avoids dotted rails where abs()/intersections cancel them.
  float px=2.0/min(uResolution.x,uResolution.y);
  float da=px/max(r,0.032), dz=depth*da;
  float fx=da*1.28+dz*0.24, fy=dz*0.70+da*0.18;
  float dx=max(min(fwidth(sin(PI*x)),fx*5.0),fx*1.75);
  float dy=max(min(fwidth(sin(PI*y)),fy*5.0),fy*1.75);
  float diagonal=sx-sy;
  float diagWidth=max(min(fwidth(diagonal),(fx+fy)*5.0),(fx+fy)*1.35);
  // The lengthwise rails and winding helix intersect at every cell corner.
  // Diagonals join those corners to each cell's central ornament.
  float rails=threadInk(sx,dx);
  float helix=threadInk(sy,dy);
  float web=threadInk(diagonal,diagWidth);
  // The woven scaffolding connects the illustrations without dominating them.
  vec3 col=art(world*0.037+0.10)*rails*(0.045+uMid*uIntensity*0.055);
  col+=art(world*0.037+0.34)*helix*(0.065+uBass*uIntensity*0.075);
  col+=art(world*0.037+0.22)*web*0.035;

  vec2 cell=fract(vec2(x,y))-0.5;
  float footprint=max(min(length(vec2(fwidth(x),fwidth(y))),(fx+fy)*2.8),max(fx,fy)*0.80);
  // x+8,y-1 names the same place around the cylinder. The row correction
  // preserves identity at that seam. Drawing identity is not mirrored: touching
  // tiles must use disjoint selections, even where the orientation reflects.
  vec2 tile=floor(vec2(x,y));
  float sector=mod(tile.x,8.0),row=tile.y+floor(tile.x/8.0);
  float seed=hash(vec2(sector+13.0,row+47.0));
  float character=hash(vec2(sector+71.0,row+3.0));
  float kind=drawingKind(tile,0,variety);
  vec2 glyph=cell;
  glyph.x*=sector<4.0?1.0:-1.0;
  glyph=rot((seed-0.5)*0.6)*glyph;
  // Different sizes, silhouettes and nested detail make each new row a drawing.
  float size=0.68+seed*0.18;
  // A hero and two distinct companions share each tile. Keep the
  // companions inside their own margins and fade them when too small to read.
  vec2 hero=glyph/size;
  float detail=variety*(1.0-smoothstep(0.006,0.024,footprint));
  float d=drawing(hero,kind,seed,detail)*size;
  float line=drawingInk(d,footprint);
  float tint=world*0.037+character*0.65;
  // Leave clear space behind each illustration instead of crossing its ink.
  col*=smoothstep(0.31,0.40,length(hero));
  vec3 drawings=art(tint)*line*(0.38+uMid*uIntensity*0.25);
  float smallVisibility=(1.0-smoothstep(0.018,0.055,footprint))*smoothstep(0.10,0.70,variety);
  if(smallVisibility>0.001) {
    // Use unrotated local coordinates for satellite placement: the complete
    // composition stays inside the same tile even at the extreme orientations.
    vec2 local=vec2(cell.x*(sector<4.0?1.0:-1.0),cell.y);
    for(int j=0;j<2;j++) {
      float k=float(j),side=j==0?-1.0:1.0;
      float tinySeed=hash(vec2(sector+101.0+k*29.0,row+89.0));
      float tinyKind=drawingKind(tile,j+1,variety);
      vec2 center=vec2(side*(0.34+0.025*seed),side*(0.31+0.035*character));
      vec2 little=rot((tinySeed-0.5)*0.6)*(local-center)/0.24;
      float ink=drawingInk(drawing(little,tinyKind,tinySeed,0.0)*0.24,footprint);
      col*=mix(1.0,smoothstep(0.31,0.42,length(little)),smallVisibility);
      drawings+=art(tint+0.18+k*0.21)*ink*smallVisibility*(0.26+uTreble*uIntensity*0.13);
    }
  }
  col+=drawings;
  float fog=exp(-depth*0.032)*smoothstep(0.018,0.055,r);
  paint(col*fog*1.75);
}`
};
