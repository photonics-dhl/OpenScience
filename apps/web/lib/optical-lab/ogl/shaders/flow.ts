export const OPTICAL_FLOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tPrevious;
uniform vec2 uPointer;
uniform vec2 uVelocity;
uniform float uFollow;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 previous = texture(tPrevious, vUv).xy * 2.0 - 1.0;
  float influence = exp(-dot(vUv - uPointer, vUv - uPointer) * 42.0) * uFollow;
  vec2 velocity = mix(previous * 0.88, uVelocity, influence * 0.34);
  fragColor = vec4(velocity * 0.5 + 0.5, influence, 1.0);
}
`;
