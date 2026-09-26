import type { VisualDefinition } from '../types.js';
import * as collection_common_js_1 from './collection-common.js';
/** One continuous cylindrical coordinate surface, not a stack of fading gates.
 * The grid is sheared into a helix. Every contour cell touches the same rails,
 * so ornaments and neighboring depth layers belong to one connected web. */
export const kaleidoscope: VisualDefinition = {
    id: 'kaleidoscope', name: 'Cosmic Kaleidoscope',
    subtitle: 'A rotating, endless woven tunnel. Connected spiral threads carry unfolding lace; bass drives flight, mids energize rotation and highs light fine filigree.',
    palette: 'iris', category: 'Fractal', cost: 'medium', reference: 'galactic-kaleidoscope psychedelic smooth spinning connected infinite tunnel flight',
    fragment: collection_common_js_1.COLLECTION + `
float threadInk(float d,float footprint) {
  float w=strokeWidth(max(footprint*0.60,0.00035));
  float core=exp(-0.5*(d/w)*(d/w));
  float glow=strokeHalo(d,w)*0.75;
  // Fade unresolvable pattern detail before it becomes a flickering white mass.
  return (core+glow)*(1.0-smoothstep(0.12,0.45,footprint));
}
void main() {
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
  vec3 col=art(world*0.037+0.10)*rails*(0.16+uMid*uIntensity*0.19);
  col+=art(world*0.037+0.34)*helix*(0.25+uBass*uIntensity*0.31);
  col+=art(world*0.037+0.22)*web*(0.15+uMid*uIntensity*0.20);

  vec2 cell=fract(vec2(x,y))-0.5;
  float cr=length(cell),ca=atan(cell.y,cell.x);
  float footprint=max(min(length(vec2(fwidth(x),fwidth(y))),(fx+fy)*2.8),max(fx,fy)*0.80);
  // Connected petals on three scales. Opposing rolls are internal to the
  // ornament, never discontinuous camera motion or separate floating gates.
  for(int j=0;j<3;j++) {
    float k=float(j),radius=0.105+k*0.117;
    float turn=(j==1?-1.0:1.0)*uFlow*0.060;
    float petals=radius*(1.0+0.10*cos(ca*8.0+turn)+0.022*cos(ca*16.0-turn));
    float d=cr-petals;
    float line=threadInk(d,footprint*0.58);
    float band=j==0?uTreble:(j==1?uMid:uBass);
    col+=art(world*0.037+k*0.14+0.05)*line*(0.14+band*uIntensity*0.24);
  }
  // Fine recursion follows the same diagonal nodes, connected to the web
  // instead of isolated loops that vanish between the depth layers.
  float fine=abs(sin(2.0*PI*x))-abs(sin(2.0*PI*y));
  float finer=abs(sin(4.0*PI*x))-abs(sin(4.0*PI*y));
  col+=art(world*0.037+0.44)*threadInk(fine,max(min(fwidth(fine),(fx+fy)*9.0),(fx+fy)*2.0))*(0.045+uTreble*uIntensity*0.105);
  col+=art(world*0.037+0.52)*threadInk(finer,max(min(fwidth(finer),(fx+fy)*18.0),(fx+fy)*4.0))*(0.018+uTreble*uIntensity*0.055);
  float fog=exp(-depth*0.032)*smoothstep(0.018,0.055,r);
  paint(col*fog*1.75);
}`
};
