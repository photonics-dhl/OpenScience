export const OPTICAL_GLYPH_VERTEX_SHADER = `#version 300 es
precision highp float;

in float glyphId;
in vec3 position;
in vec2 uv;

uniform vec2 uViewport;

out float vGlyphId;
out vec2 vUv;

void main() {
  vec2 clip = vec2(
    position.x / uViewport.x * 2.0 - 1.0,
    1.0 - position.y / uViewport.y * 2.0
  );
  vGlyphId = glyphId;
  vUv = uv;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const OPTICAL_GLYPH_FRAGMENT_SHADER = `#version 300 es
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform vec3 uAccentColor;
uniform vec3 uBaseColor;
uniform float uDistanceRange;
uniform float uOutputMask;
uniform float uPeriodId;
uniform sampler2D tAtlas;

in float vGlyphId;
in vec2 vUv;

out vec4 fragColor;

float median(float red, float green, float blue) {
  return max(min(red, green), min(max(red, green), blue));
}

void main() {
  vec3 sampleValue = texture(tAtlas, vUv).rgb;
  float signedDistance = median(sampleValue.r, sampleValue.g, sampleValue.b) - 0.5;
  vec2 unitRange = vec2(uDistanceRange) / vec2(textureSize(tAtlas, 0));
  vec2 screenTexSize = vec2(1.0) / max(fwidth(vUv), vec2(0.000001));
  float screenPxRange = max(0.5 * dot(unitRange, screenTexSize), 1.0);
  float alpha = clamp(signedDistance * screenPxRange + 0.5, 0.0, 1.0);
  if (alpha <= 0.001) discard;

  if (uOutputMask > 0.5) {
    fragColor = vec4(alpha, alpha, alpha, alpha);
    return;
  }

  float period = 1.0 - step(0.25, abs(vGlyphId - uPeriodId));
  vec3 color = mix(uBaseColor, uAccentColor, period);
  fragColor = vec4(color * alpha, alpha);
}
`;

export const OPTICAL_GLYPH_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tColor;

in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = texture(tColor, vUv);
}
`;
