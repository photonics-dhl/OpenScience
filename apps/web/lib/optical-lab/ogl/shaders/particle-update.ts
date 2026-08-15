export const OPTICAL_DISSOLUTION_STRATA = 48;

export const OPTICAL_PARTICLE_UPDATE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tGlyphMask;
uniform sampler2D tMap;

in vec2 vUv;
out vec4 fragColor;

float hash11(float value) {
  return fract(sin(value * 127.1 + 311.7) * 43758.5453123);
}

void main() {
  vec4 seed = texture(tMap, vUv);
  float mask = texture(tGlyphMask, seed.xy).r;
  float affected = smoothstep(0.45, 0.565, seed.x) * step(0.055, mask);
  if (affected <= 0.001) {
    fragColor = vec4(-2.0, -2.0, 0.0, 0.0);
    return;
  }

  float randomA = seed.z;
  float randomB = hash11(seed.z + seed.w * 17.0);
  float randomC = hash11(seed.z * 41.0 + seed.w);
  float transfer = smoothstep(0.43, 0.58, seed.x);
  vec2 position = seed.xy;

  if (seed.w < 0.68) {
    float curtainTransfer = smoothstep(0.43, 0.465, seed.x);
    float curtainY = 0.03 + randomB * 0.94;
    float curtainVertical = curtainY - 0.515;
    float curtainSpread = mix(0.004, 0.047, pow(abs(curtainVertical) / 0.485, 1.35));
    float curvedCenter = 0.58
      + sign(curtainVertical) * curtainVertical * curtainVertical * (randomC - 0.5) * 0.055;
    position.x = mix(
      seed.x,
      curvedCenter + (randomA - 0.5) * curtainSpread + sin(curtainVertical * 37.0 + randomC * 6.283) * 0.0018,
      curtainTransfer
    );
    position.y = mix(seed.y, curtainY, curtainTransfer * 0.98);
  } else if (seed.w > 0.86) {
    float downstream = pow(randomB, 1.35);
    position.x = 0.583 + downstream * 0.365;
    position.y = 0.515 + (seed.y - 0.515) * (1.0 + downstream * 2.6)
      + (randomC - 0.5) * mix(0.045, 0.16, downstream);
  } else {
    float dissolutionRole = smoothstep(0.455, 0.565, seed.x);
    float stratum = floor(randomA * 48.0) / 47.0;
    float stratumJitter = (randomC - 0.5) * 0.0014;
    float upperBand = step(0.5, randomB);
    float bandT = fract(randomB * 2.0);
    float lowerY = mix(0.27, 0.39, bandT);
    float upperY = mix(0.64, 0.73, bandT);
    position.x = mix(seed.x, mix(0.482, 0.575, stratum) + stratumJitter, dissolutionRole);
    position.y = mix(seed.y, mix(lowerY, upperY, upperBand), dissolutionRole * 0.98);
  }

  float luminance = affected * mask * mix(0.27, 0.63, randomC);
  float size = mix(1.0, 3.3, pow(randomA, 2.1));
  fragColor = vec4(position, luminance, size);
}
`;
