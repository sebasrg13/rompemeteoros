/* engine/Shaders.js — GLSL ES 1.00 (compatible con WebGL1 y WebGL2) */
(function (BB) {
  'use strict';
  const S = {};

  S.litVS = `
attribute vec3 aPos; attribute vec3 aNormal; attribute vec4 aColor;
#ifdef INST
attribute vec4 aI0; attribute vec4 aI1;
varying float vA;
#endif
uniform mat4 uModel; uniform mat4 uViewProj;
varying vec3 vN; varying vec3 vW; varying vec4 vC;
void main(){
  vec3 p = aPos; vec3 n = aNormal;
#ifdef INST
  p.y *= aI1.y;
  float cs = cos(aI1.w), ss = sin(aI1.w);
  p = vec3(p.x*cs + p.z*ss, p.y, -p.x*ss + p.z*cs);
  n = vec3(n.x*cs + n.z*ss, n.y, -n.x*ss + n.z*cs);
  float ca = cos(aI1.x), sa = sin(aI1.x);
  p = vec3(p.x*ca - p.y*sa, p.x*sa + p.y*ca, p.z);
  n = vec3(n.x*ca - n.y*sa, n.x*sa + n.y*ca, n.z);
  p = p * aI0.w + aI0.xyz;
  vA = aI1.z;
#endif
  vec4 w = uModel * vec4(p, 1.0);
  vW = w.xyz;
  vN = (uModel * vec4(n, 0.0)).xyz;
  vC = aColor;
  gl_Position = uViewProj * w;
}`;

  S.litFS = `
uniform vec3 uColor; uniform vec3 uEmissive; uniform vec2 uSpec; uniform vec4 uRim;
uniform float uOpacity; uniform float uFlash; uniform float uGlow;
uniform vec3 uLightDir; uniform vec3 uLightColor; uniform vec3 uAmbSky; uniform vec3 uAmbGround;
uniform vec3 uCamPos; uniform vec3 uFogColor; uniform vec2 uFog;
#ifndef SIMPLE
uniform vec4 uPL[4]; uniform vec3 uPLC[4];
#endif
varying vec3 vN; varying vec3 vW; varying vec4 vC;
#ifdef INST
varying float vA;
#endif
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vW);
  vec3 base = uColor * vC.rgb;
  float nl = max(dot(N, uLightDir), 0.0);
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
  vec3 H = normalize(uLightDir + V);
  float sp = pow(max(dot(N, H), 0.0), uSpec.y) * uSpec.x;
  vec3 col = base * (amb + uLightColor * nl) + uLightColor * sp;
#ifndef SIMPLE
  for (int i = 0; i < 4; i++) {
    vec3 L = uPL[i].xyz - vW;
    float d = length(L);
    float att = clamp(1.0 - d / max(uPL[i].w, 0.001), 0.0, 1.0);
    att *= att;
    col += uPLC[i] * att * (base * max(dot(N, L / max(d, 0.001)), 0.0) * 1.4 + 0.12);
  }
#endif
  float fr = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  col += uRim.rgb * fr * uRim.a;
  col = mix(col, base * (0.35 + 0.75 * uGlow), clamp(vC.a, 0.0, 1.0));
  col += uEmissive;
  col = mix(col, vec3(1.0, 0.96, 0.9), uFlash);
  float fog = smoothstep(uFog.x, uFog.y, length(uCamPos - vW));
  col = mix(col, uFogColor, fog);
  float a = uOpacity;
#ifdef INST
  a *= vA;
#endif
  gl_FragColor = vec4(col, a);
}`;

  S.shadowVS = `
attribute vec3 aPos;
uniform mat4 uModel; uniform mat4 uViewProj; uniform mat4 uShadow;
void main(){ gl_Position = uViewProj * (uShadow * (uModel * vec4(aPos, 1.0))); }`;
  S.shadowFS = `
uniform vec4 uShadowColor;
void main(){ gl_FragColor = uShadowColor; }`;

  S.spriteVS = `
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol;
uniform mat4 uViewProj;
varying vec2 vUV; varying vec4 vCol;
void main(){ vUV = aUV; vCol = aCol; gl_Position = uViewProj * vec4(aPos, 1.0); }`;
  S.spriteFS = `
uniform sampler2D uTex;
varying vec2 vUV; varying vec4 vCol;
void main(){
  vec4 t = texture2D(uTex, vUV);
#ifdef ADD
  gl_FragColor = vec4(t.rgb * vCol.rgb * t.a * vCol.a, 1.0);
#else
  gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
#endif
}`;

  S.bgVS = `
attribute vec2 aPos;
uniform vec2 uUVScale; uniform vec2 uOffset;
varying vec2 vUV; varying vec2 vP;
void main(){ vP = aPos; vUV = (aPos * 0.5) * uUVScale + 0.5 + uOffset; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
  S.bgFS = `
uniform sampler2D uTex; uniform vec3 uTint; uniform float uPulse;
varying vec2 vUV; varying vec2 vP;
void main(){
  vec3 c = texture2D(uTex, vUV).rgb * uTint;
  float v = 1.0 - dot(vP * vec2(0.55, 0.45), vP * vec2(0.55, 0.45));
  c *= mix(0.55, 1.0, clamp(v, 0.0, 1.0));
  c += vec3(0.02, 0.025, 0.06) + uPulse * vec3(0.25, 0.02, 0.04) * (1.0 - v);
  gl_FragColor = vec4(c, 1.0);
}`;

  S.starsVS = `
attribute vec3 aPos; attribute vec2 aInfo;
uniform mat4 uViewProj; uniform float uTime; uniform float uPx; uniform float uWarp;
varying float vA; varying float vT;
void main(){
  vec3 p = aPos;
  p.z = mod(p.z + uTime * uWarp + 160.0, 320.0) - 160.0;
  vec4 c = uViewProj * vec4(p, 1.0);
  gl_Position = c;
  float s = aInfo.x * uPx / max(c.w, 1.0);
  gl_PointSize = clamp(s, 1.0, 7.0);
  vA = 0.55 + 0.45 * sin(uTime * (1.2 + aInfo.y) + aInfo.y * 17.0);
  vT = aInfo.y;
}`;
  S.starsFS = `
varying float vA; varying float vT;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  float a = smoothstep(0.25, 0.0, r) * vA;
  vec3 c = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), vT);
  gl_FragColor = vec4(c * a, 1.0);
}`;

  S.surfVS = `
attribute vec3 aPos; attribute vec2 aUV;
uniform mat4 uModel; uniform mat4 uViewProj;
varying vec2 vUV; varying vec3 vW;
void main(){ vUV = aUV; vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; gl_Position = uViewProj * w; }`;
  S.surfFS = `
uniform sampler2D uTex; uniform vec3 uTint; uniform vec3 uCamPos; uniform vec3 uFogColor; uniform vec2 uFog; uniform float uTime; uniform float uScroll;
uniform vec4 uPL[4]; uniform vec3 uPLC[4];
varying vec2 vUV; varying vec3 vW;
void main(){
  vec4 t = texture2D(uTex, vec2(vUV.x, vUV.y));
  vec3 c = t.rgb * uTint;
  float line = smoothstep(0.985, 1.0, sin((vUV.y * 26.0 - uTime * uScroll) * 3.14159) * 0.5 + 0.5);
  c += vec3(0.1, 0.5, 0.9) * line * 0.25 * t.a;
  for (int i = 0; i < 4; i++) {
    float d = length(uPL[i].xyz - vW);
    float att = clamp(1.0 - d / max(uPL[i].w, 0.001), 0.0, 1.0);
    c += uPLC[i] * att * att * 0.55;
  }
  float fog = smoothstep(uFog.x, uFog.y, length(uCamPos - vW));
  c = mix(c, uFogColor, fog);
  gl_FragColor = vec4(c, t.a * (1.0 - fog * 0.6));
}`;

  BB.Shaders = S;
})(window.BB);
