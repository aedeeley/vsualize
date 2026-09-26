#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime, uBass, uMid, uTreble, uVolume, uBeat;
uniform float uClock, uTravel, uTurn, uFlow, uColorShift, uSpeed;
uniform float uBassHit, uMidHit, uTrebleHit, uAudioAccent, uImpact;
uniform float uIntensity, uGlow, uDetail, uTransparent, uOpacity, uIdle;
uniform vec3 uColorA, uColorB, uColorC, uBackground;
uniform sampler2D uSpectrum, uWaveform, uHistory;
uniform float uHistoryHead, uHistoryPhase;
uniform vec4 uImpulses[24];
out vec4 fragColor;
const float PI = 3.141592653589793;
float sat(float x) { return clamp(x, 0.0, 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p) {
  float n=0.0, a=0.5;
  for(int i=0;i<4;i++) { n+=a*noise(p); p=mat2(1.6,-1.2,1.2,1.6)*p+2.71; a*=0.5; }
  return n;
}
vec3 palette(float t) {
  t += uColorShift;
  float a=0.5+0.5*sin(t*6.28318);
  float b=0.5+0.5*sin(t*6.28318+2.0944);
  return mix(mix(uColorA,uColorB,a),uColorC,b*0.45);
}
float spectrum(float x) { return texture(uSpectrum,vec2(clamp(x,0.0,1.0),0.5)).r; }
float wave(float x) { return texture(uWaveform,vec2(clamp(x,0.0,1.0),0.5)).r*2.0-1.0; }
// Recent detected attacks launch waves that keep traveling after their source fades.
// Uses actual onset history, never a free-running sine masquerading as a beat.
float attackRings(float r, float speed, float width) {
  float value=0.0;
  for(int i=0;i<24;i++) {
    float age=uClock-uImpulses[i].x;
    if(age>=0.0 && age<4.8) {
      float d=r-0.04-age*speed;
      value+=uImpulses[i].y*exp(-d*d/max(width*width,0.000001))*exp(-age*0.9)*smoothstep(0.0,0.08,age)*(1.0-smoothstep(3.5,4.8,age));
    }
  }
  return value;
}
// Sample past sound at a stable age. The phase correction keeps ring-buffer
// head changes continuous; neighboring rows are interpolated explicitly.
float pastSpectrum(float frequency, float secondsAgo) {
  float age=clamp(secondsAgo*24.0-uHistoryPhase,0.0,62.0);
  float row=mod(uHistoryHead-floor(age)+64.0,64.0);
  float previous=mod(row-1.0+64.0,64.0);
  float a=texture(uHistory,vec2(clamp(frequency,0.0,1.0),(row+0.5)/64.0)).r;
  float b=texture(uHistory,vec2(clamp(frequency,0.0,1.0),(previous+0.5)/64.0)).r;
  return mix(a,b,fract(age));
}
vec2 sceneUV() { return (gl_FragCoord.xy*2.0-uResolution)/min(uResolution.x,uResolution.y); }
void finish(vec3 color, float coverage) {
  color=max(color,vec3(0.0))*(0.78+uAudioAccent*0.40);
  color=vec3(1.0)-exp(-color*(0.90+uGlow*0.55));
  float a=clamp(coverage*uOpacity,0.0,0.97);
  if(uTransparent>0.5) {
    // Unpremultiplied output. Tiny alpha keeps the empty canvas interactive.
    fragColor=vec4(color,max(a,0.005));
  } else {
    fragColor=vec4(mix(uBackground,color,sat(coverage)),1.0);
  }
}
