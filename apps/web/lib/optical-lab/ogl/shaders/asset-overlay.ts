export const OPTICAL_ASSET_OVERLAY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tFlow;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 flowSample = texture(tFlow, vUv);
  float carrier = flowSample.a * 2.0 - 1.0;
  vec3 coolTint = vec3(0.08, 0.24, 0.32);
  vec3 warmTint = vec3(0.36, 0.16, 0.08);
  vec3 tint = mix(coolTint, warmTint, step(0.0, carrier));
  float overlayAlpha = min(0.16, abs(carrier) * 0.16);
  fragColor = vec4(tint, overlayAlpha);
}
`;
