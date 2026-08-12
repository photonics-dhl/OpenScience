export const OPTICAL_HIGH_ENERGY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tParticles;

in vec2 vUv;
out vec4 fragColor;

float ray(float slope, float width, float downstream, float vertical) {
  return exp(-abs(vertical - downstream * slope) / width)
    + exp(-abs(vertical + downstream * slope) / width);
}

float curvedFilament(float offset, float curve, float phase, float vertical) {
  float bend = sign(vertical) * vertical * vertical * curve;
  float center = offset + bend + sin(vertical * 43.0 + phase) * 0.0007;
  float filament = exp(-abs((vUv.x - 0.58) - center) / 0.00115);
  float filamentGate = 0.42 + 0.58 * smoothstep(-0.72, 0.38, sin(vertical * 67.0 + phase * 3.7));
  return filament * filamentGate;
}

void main() {
  vec4 particles = texture(tParticles, vUv);
  float deltaX = vUv.x - 0.58;
  float deltaY = vUv.y - 0.515;
  float verticalEnvelope = smoothstep(0.15, 0.22, vUv.y) * smoothstep(0.15, 0.22, 1.0 - vUv.y);
  float caustic = verticalEnvelope * min(1.0,
    curvedFilament(-0.023, -0.045, 0.2, deltaY)
    + curvedFilament(-0.015, 0.035, 1.1, deltaY)
    + curvedFilament(-0.0075, -0.028, 2.0, deltaY)
    + curvedFilament(0.0, 0.02, 2.9, deltaY)
    + curvedFilament(0.0075, -0.032, 3.8, deltaY)
    + curvedFilament(0.015, 0.04, 4.7, deltaY)
    + curvedFilament(0.023, -0.038, 5.6, deltaY)
  );
  float downstream = max(deltaX, 0.0);
  float rightOnly = step(0.0, deltaX) * smoothstep(0.006, 0.04, downstream) * exp(-downstream * 3.2);
  float rays = rightOnly * (
    ray(0.2, 0.011, downstream, deltaY) * 0.44
    + ray(0.68, 0.014, downstream, deltaY) * 0.34
    + ray(1.14, 0.017, downstream, deltaY) * 0.22
  );
  float outerPlume = rightOnly * smoothstep(0.09, 0.34, abs(deltaY)) * 0.36;
  float energy = max(particles.a * 0.2, caustic * 1.18 + rays * 0.7 + outerPlume);
  vec3 warm = mix(vec3(0.72, 0.82, 0.92), vec3(1.0, 0.955, 0.84), caustic);
  fragColor = vec4(warm * energy, energy);
}
`;

export const OPTICAL_ENERGY_BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uDirection;
uniform vec2 uTexelSize;
uniform sampler2D tEnergy;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 color = texture(tEnergy, vUv) * 0.227027;
  color += texture(tEnergy, vUv + uDirection * uTexelSize * 1.384615) * 0.316216;
  color += texture(tEnergy, vUv - uDirection * uTexelSize * 1.384615) * 0.316216;
  color += texture(tEnergy, vUv + uDirection * uTexelSize * 3.230769) * 0.070270;
  color += texture(tEnergy, vUv - uDirection * uTexelSize * 3.230769) * 0.070270;
  fragColor = color;
}
`;

export const OPTICAL_RESTING_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uViewport;
uniform sampler2D tBlurredEnergy;
uniform sampler2D tEnergy;
uniform sampler2D tGlyphColor;
uniform sampler2D tGlyphMask;
uniform sampler2D tParticles;

in vec2 vUv;
out vec4 fragColor;

float grain(vec2 coordinate) {
  return fract(sin(dot(coordinate, vec2(12.9898, 78.233)) + 19.19) * 43758.5453);
}

void main() {
  vec4 glyph = texture(tGlyphColor, vUv);
  float glyphMask = texture(tGlyphMask, vUv).r;
  vec4 particles = texture(tParticles, vUv);
  vec4 energy = texture(tEnergy, vUv);
  vec4 blurred = texture(tBlurredEnergy, vUv);

  float upstream = smoothstep(0.465, 0.578, vUv.x) * (1.0 - step(0.58, vUv.x));
  float breakup = smoothstep(0.26, 0.82, grain(floor(vUv * uViewport * 0.42)));
  float retained = 1.0 - upstream * breakup * 0.34;
  glyph *= retained;

  float seam = 1.0 - smoothstep(0.0, 0.044, abs(vUv.x - 0.58));
  vec2 spectralOffset = vec2(1.15 / uViewport.x, 0.0);
  float redEdge = texture(tEnergy, vUv + spectralOffset).r;
  float blueEdge = texture(tEnergy, vUv - spectralOffset).b;
  vec3 spectral = vec3(redEdge, energy.g, blueEdge) * seam * 0.045;

  vec3 premultiplied = glyph.rgb
    + particles.rgb * 0.84
    + energy.rgb * 0.78
    + blurred.rgb * 0.24
    + spectral;
  float alpha = clamp(glyph.a + particles.a * 0.84 + energy.a * 0.78 + blurred.a * 0.24, 0.0, 1.0);
  float monochromeGrain = (grain(gl_FragCoord.xy) - 0.5) * 0.012 * alpha;
  premultiplied += vec3(monochromeGrain);
  if (alpha <= 0.0001) discard;
  fragColor = vec4(max(premultiplied, 0.0) / alpha, alpha);
}
`;
