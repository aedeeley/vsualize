import * as collection_common_js_1 from './collection-common.js';
/** New ripple-only uniforms. Existing effect shaders are deliberately untouched. */
export const RIPPLE_FAMILY = collection_common_js_1.COLLECTION + `
uniform sampler2D uRippleField;
vec4 soundFieldRGBA(float angle, float secondsAgo) {
  float age=clamp(secondsAgo*24.0-uHistoryPhase,0.0,62.0);
  // The texture repeats vertically: hardware bilinear filtering blends the
  // same adjacent history rows, including the ring seam, in one fetch.
  float row=mod(uHistoryHead-age+64.0,64.0);
  float u=fract(angle/(2.0*PI))+0.5/128.0;
  return texture(uRippleField,vec2(u,(row+0.5)/64.0));
}
vec3 soundField(float angle,float secondsAgo) { return soundFieldRGBA(angle,secondsAgo).rgb; }
float sharpContour(float d,float width) {
  width=strokeWidth(width);
  float core=exp(-0.5*(d/width)*(d/width));
  return core+strokeHalo(d,width);
}
`;
