/** Flight through a stable Julia set. Changing c live makes the whole boundary
 * jump: audio instead drives accumulated travel, contour relief and lighting.
 * Repelling periodic points keep the camera on real boundary detail. Finite
 * float precision is handled with overlapping inward journeys, not a zoom reset. */
export const JULIA_FLIGHT = `
vec2 csqrt(vec2 z) {
  float r=length(z);
  return vec2(sqrt(max(0.0,(r+z.x)*0.5)),(z.y<0.0 ? -1.0 : 1.0)*sqrt(max(0.0,(r-z.x)*0.5)));
}
vec2 boundaryPoint(vec2 c,float leg) {
  vec2 fixedPoint=(vec2(1.0,0.0)+csqrt(vec2(1.0,0.0)-4.0*c))*0.5;
  // Inverse itineraries chosen for visible structure over several zoom depths.
  int route=c.y>0.13 ? (mod(leg,2.0)<1.0 ? 119 : 127) : (mod(leg,2.0)<1.0 ? 125 : 117);
  vec2 target=fixedPoint;
  for(int i=0;i<8;i++) target=csqrt(target-c)*(((route>>i)&1)==1 ? -1.0 : 1.0);
  return target;
}
vec4 juliaLeg(vec2 p,float depth,float leg,vec2 c,float variant) {
  vec2 target=boundaryPoint(c,leg);
  // A fixed camera heading, not audio-driven roll or a lateral wobble.
  vec2 z=target+rot(0.12+variant*0.18)*p*exp(-depth)*1.25;
  float trap=100.0,iteration=0.0;
  int limit=int(mix(100.0,180.0,uDetail));
  for(int i=0;i<180;i++) {
    if(i>=limit) break;
    z=vec2(z.x*z.x-z.y*z.y,2.0*z.x*z.y)+c;
    trap=min(trap,abs(length(z)-0.72));
    if(dot(z,z)>256.0) break;
    iteration+=1.0;
  }
  float escaped=1.0-step(float(limit)-0.5,iteration);
  float mu=iteration+1.0-log2(max(log2(max(length(z),1.001)),0.001));
  float film=sin(log(max(trap,0.0002))*2.3-mu*0.34);
  float bands=0.5+0.5*cos(mu*0.66+film*0.50-uFlow*0.035);
  float local=spectrum(fract(mu/44.0));
  float ridge=pow(bands,6.0-2.0*local);
  vec3 color=art(mu*0.025+film*0.08+variant*0.18+uColorShift*0.08);
  float lowLayer=exp(-max(mu-7.0,0.0)*0.075);
  float midLayer=pow(0.5+0.5*sin(mu*0.25+0.8),3.0);
  float highLayer=pow(bands,16.0)*smoothstep(10.0,38.0,mu);
  color*=0.24+bands*0.40+uBass*lowLayer*1.10+uMid*midLayer*1.2+local*ridge*0.90;
  color+=uColorC*highLayer*(uTreble*0.65);
  color+=uColorB*pow(bands,20.0)*(0.07+uTreble*0.40+uTrebleHit*0.12);
  return vec4(color,escaped*(0.63+0.34*bands));
}
vec4 juliaFlight(vec2 p,vec2 c,float variant) {
  float journey=uTravel*0.30,span=5.5,overlap=1.35;
  float leg=floor(journey/span),phase=mod(journey,span);
  vec4 a=juliaLeg(p,phase+overlap,leg,c,variant);
  if(phase>span-overlap) {
    vec4 b=juliaLeg(p,phase-(span-overlap),leg+1.0,c,variant);
    float blend=smoothstep(span-overlap,span,phase),alpha=mix(a.a,b.a,blend);
    a=vec4(mix(a.rgb*a.a,b.rgb*b.a,blend)/max(alpha,0.001),alpha);
  }
  return a;
}
`;
