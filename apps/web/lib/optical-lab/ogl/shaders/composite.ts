export const OPTICAL_HIGH_ENERGY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tParticles;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 particles = texture(tParticles, vUv);
  float deltaX = vUv.x - 0.58;
  float deltaY = vUv.y - 0.515;
  float verticalEnvelope = smoothstep(0.15, 0.22, vUv.y) * smoothstep(0.15, 0.22, 1.0 - vUv.y);
  float nearbyParticles = max(
    max(texture(tParticles, vUv + vec2(0.004, 0.0)).a, texture(tParticles, vUv - vec2(0.004, 0.0)).a),
    max(texture(tParticles, vUv + vec2(0.0, 0.006)).a, texture(tParticles, vUv - vec2(0.0, 0.006)).a)
  );
  float lensHalfWidth = mix(0.013, 0.0287, smoothstep(0.08, 0.34, abs(deltaY)));
  float lensBend = sign(deltaY) * deltaY * deltaY * 0.012;
  float shellParticles = 0.0;
  for (int yIndex = -2; yIndex <= 2; yIndex += 1) {
    float sampleY = clamp(vUv.y + float(yIndex) * 0.012, 0.0, 1.0);
    shellParticles = max(shellParticles, max(
      texture(tParticles, vec2(0.555, sampleY)).a,
      max(texture(tParticles, vec2(0.58, sampleY)).a, texture(tParticles, vec2(0.605, sampleY)).a)
    ));
  }
  float particleEvidence = smoothstep(0.004, 0.13, max(shellParticles, nearbyParticles));
  float lensShell = exp(-abs(abs(deltaX - lensBend) - lensHalfWidth) / 0.0032);
  float shellVariation = 0.88 + 0.12 * sin(deltaY * 13.0 + deltaX * 31.0);
  float caustic = verticalEnvelope * lensShell * shellVariation * mix(0.08, 1.0, particleEvidence);
  float downstreamParticle = particles.a * mix(0.2, 0.035, smoothstep(0.59, 0.64, vUv.x));
  float energy = max(downstreamParticle, caustic * 2.65);
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
uniform float uCausticGain;

in vec2 vUv;
out vec4 fragColor;

float grain(vec2 coordinate) {
  return fract(sin(dot(coordinate, vec2(12.9898, 78.233)) + 19.19) * 43758.5453);
}

float coherentRayField(vec2 uv) {
  float downstream = uv.x - 0.58;
  if (downstream <= 0.0) return 0.0;
  float vertical = uv.y - 0.515;
  float slope = vertical / max(0.001, downstream);
  float slopeGate = (1.0 - smoothstep(1.42, 1.58, abs(slope)))
    * smoothstep(0.08, 0.24, abs(slope));
  float warpedSlope = slope + sin(slope * 5.7) * 0.018;
  float indexedSlope = (warpedSlope + 1.6) * 8.75;
  float rayIndex = floor(indexedSlope);
  float rayPhase = fract(indexedSlope);
  float rayGain = 0.42 + 0.58 * fract(sin(rayIndex * 12.9898 + 4.71) * 43758.5453);
  float ridge = exp(-abs(rayPhase - 0.5) / 0.052) * rayGain;
  vec2 sourceUv = vec2(0.58, clamp(0.515 + slope * 0.028, 0.03, 0.97));
  float sourceParticles = max(
    texture(tParticles, sourceUv).a,
    max(texture(tParticles, sourceUv + vec2(0.004, 0.0)).a, texture(tParticles, sourceUv - vec2(0.004, 0.0)).a)
  );
  float sourceEvidence = smoothstep(0.004, 0.12, sourceParticles);
  return smoothstep(0.035, 0.075, downstream)
    * exp(-downstream * 2.4)
    * slopeGate
    * ridge
    * mix(0.08, 1.0, sourceEvidence);
}

void main() {
  vec4 glyph = texture(tGlyphColor, vUv);
  float glyphMask = texture(tGlyphMask, vUv).r;
  vec4 particles = texture(tParticles, vUv);
  vec4 energy = texture(tEnergy, vUv);
  vec4 blurred = texture(tBlurredEnergy, vUv);
  float coherentRays = coherentRayField(vUv);

  float upstream = smoothstep(0.465, 0.578, vUv.x) * (1.0 - step(0.58, vUv.x));
  float breakup = smoothstep(0.26, 0.82, grain(floor(vUv * uViewport * 0.42)));
  float retained = 1.0 - upstream * breakup * 0.34;
  glyph *= retained;

  float seam = 1.0 - smoothstep(0.0, 0.044, abs(vUv.x - 0.58));
  vec2 spectralOffset = vec2(1.15 / uViewport.x, 0.0);
  float redEdge = texture(tEnergy, vUv + spectralOffset).r;
  float blueEdge = texture(tEnergy, vUv - spectralOffset).b;
  vec3 spectral = vec3(redEdge, energy.g, blueEdge) * seam * 0.045;

  float directParticleGain = mix(0.84, 0.16, smoothstep(0.59, 0.64, vUv.x));
  vec3 premultiplied = glyph.rgb
    + particles.rgb * directParticleGain
    + energy.rgb * (0.78 + uCausticGain)
    + blurred.rgb * (0.09 + uCausticGain * 0.5)
    + vec3(0.82, 0.9, 1.0) * coherentRays * 1.45
    + spectral;
  float alpha = clamp(glyph.a + particles.a * directParticleGain + energy.a * 0.78 + blurred.a * 0.09 + coherentRays * 1.45, 0.0, 1.0);
  float monochromeGrain = (grain(gl_FragCoord.xy) - 0.5) * 0.012 * alpha;
  premultiplied += vec3(monochromeGrain);
  if (alpha <= 0.0001) discard;
  fragColor = vec4(max(premultiplied, 0.0) / alpha, alpha);
}
`;
