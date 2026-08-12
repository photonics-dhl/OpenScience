export const OPTICAL_PARTICLE_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 particleUv;

uniform float uDpr;
uniform float uStateSize;
uniform sampler2D tState;

out float vLuminance;

void main() {
  vec2 stateUv = particleUv + vec2(0.5 / uStateSize);
  vec4 state = texture(tState, stateUv);
  vLuminance = state.z;
  gl_PointSize = state.w * uDpr;
  gl_Position = vec4(state.xy * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const OPTICAL_PARTICLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in float vLuminance;
out vec4 fragColor;

void main() {
  vec2 point = gl_PointCoord - 0.5;
  float radial = 1.0 - smoothstep(0.24, 0.5, length(point));
  float alpha = radial * vLuminance;
  if (alpha <= 0.002) discard;
  vec3 warmWhite = mix(vec3(0.76, 0.82, 0.88), vec3(1.0, 0.965, 0.88), vLuminance);
  fragColor = vec4(warmWhite * alpha, alpha);
}
`;
