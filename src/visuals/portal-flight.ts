import * as collection_common_js_1 from './collection-common.js';
/** Perspective corridors shared only by the two r3 tunnel refinements.
 * Depth decreases as accumulated travel increases. A gate's world identity
 * stays constant until it has faded out near the camera and recycles far away. */
export const PORTAL_FLIGHT = collection_common_js_1.COLLECTION + `
float flightInk(float d,float footprint) {
  float w=strokeWidth(max(footprint*0.72,0.0012));
  return exp(-0.5*(d/w)*(d/w))+strokeHalo(d,w)*0.80;
}
float gateDepth(float slot,float travel,float spacing,float count) {
  return 0.16+mod(slot*spacing-travel,spacing*count);
}
float gateIdentity(float depth,float travel,float spacing) {
  return floor((travel+depth-0.16)/spacing+0.5);
}
float gateLife(float depth,float span) {
  return smoothstep(0.16,0.72,depth)*(1.0-smoothstep(span*0.73,span,depth));
}
`;
