export const OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tEnergy;
uniform sampler2D tFlow;
uniform sampler2D tTarget;
uniform vec2 uRefractionPx;
uniform vec2 uViewport;
uniform float uCausticGain;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 flowSample = texture(tFlow, vUv);
  vec2 flow = flowSample.xy * 2.0 - 1.0;
  float flowLength = length(flow);
  if (flowLength > 1.0) flow /= flowLength;
  float localAmount = smoothstep(0.02, 0.72, flowSample.z);

  vec3 targetAuthored = texture(tTarget, vUv).rgb;
  vec4 energyAuthored = texture(tEnergy, vUv);
  float targetMask = smoothstep(0.26, 0.33, vUv.y)
    * (1.0 - smoothstep(0.60, 0.64, vUv.y));
  float targetLuminance = dot(targetAuthored, vec3(0.2126, 0.7152, 0.0722)) * targetMask;
  float energyLuminance = dot(energyAuthored.rgb, vec3(0.2126, 0.7152, 0.0722));
  float energySignal = energyAuthored.a * energyLuminance;
  float emptyWeight = 0.22;
  float typeWeight = 0.62;
  float energyWeight = 1.0;
  float layerWeight = mix(emptyWeight, typeWeight, smoothstep(0.04, 0.42, targetLuminance));
  layerWeight = mix(layerWeight, energyWeight, smoothstep(0.06, 0.48, energySignal));

  float ambientBudget = 0.7;
  float localBudget = min(4.0, length(uRefractionPx));
  float displacementBudget = mix(ambientBudget, localBudget, localAmount) * layerWeight;
  vec2 displacedUv = clamp(vUv - flow * displacementBudget / uViewport, vec2(0.0), vec2(1.0));

  vec3 target = texture(tTarget, displacedUv).rgb;
  vec4 energy = texture(tEnergy, displacedUv);
  float displacedTargetMask = smoothstep(0.26, 0.33, displacedUv.y)
    * (1.0 - smoothstep(0.60, 0.64, displacedUv.y));
  vec3 energyPlate = mix(vec3(0.0196), energy.rgb, energy.a);
  vec3 authored = mix(energyPlate, target, displacedTargetMask);
  float gain = min(0.08, max(0.0, uCausticGain)) * localAmount * layerWeight;
  float authoredSignal = max(targetLuminance, energySignal);
  float emptySignal = 1.0 - smoothstep(0.015, 0.08, authoredSignal);
  float liquidWave = 0.5 + 0.5 * sin(
    vUv.x * 29.0 + sin(vUv.y * 23.0 + flow.y * 5.0) * 2.4 + flow.x * 6.0
  );
  float liquidGrain = smoothstep(0.16, 0.88, liquidWave);
  float emptyLift = emptySignal * localAmount * emptyWeight * 0.12 * (0.35 + 0.65 * liquidGrain);
  vec3 color = min(vec3(1.0), authored + energy.rgb * gain + vec3(emptyLift));
  float replacement = smoothstep(0.0005, 0.012, flowLength) * mix(0.34, 1.0, localAmount);
  fragColor = vec4(color, replacement);
}
`;
