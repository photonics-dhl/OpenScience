export const OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tEnergy;
uniform sampler2D tFlow;
uniform sampler2D tTarget;
uniform vec2 uRefractionPx;
uniform vec2 uViewport;
uniform float uAmbientPhase;
uniform float uCausticGain;
uniform float uPatchFollowPx;
uniform float uPresentationAlpha;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 flowSample = texture(tFlow, vUv);
  vec2 flow = flowSample.xy * 2.0 - 1.0;
  float flowLength = length(flow);
  if (flowLength > 1.0) flow /= flowLength;
  float localAmount = smoothstep(0.02, 0.72, flowSample.z);
  float presentationIdle = uPresentationAlpha * (1.0 - localAmount);
  float ambientTime = uAmbientPhase * 6.28318530718;

  vec3 targetAuthored = texture(tTarget, vUv).rgb;
  vec4 energyAuthored = texture(tEnergy, vUv);
  float targetMask = smoothstep(0.40, 0.42, vUv.y)
    * (1.0 - smoothstep(0.72, 0.74, vUv.y));
  float targetLuminance = dot(targetAuthored, vec3(0.2126, 0.7152, 0.0722)) * targetMask;
  float energyLuminance = dot(energyAuthored.rgb, vec3(0.2126, 0.7152, 0.0722));
  float energySignal = energyAuthored.a * energyLuminance;
  float emptyWeight = 0.22;
  float typeWeight = 0.62;
  float energyWeight = 1.0;
  float layerWeight = mix(emptyWeight, typeWeight, smoothstep(0.04, 0.42, targetLuminance));
  layerWeight = mix(layerWeight, energyWeight, smoothstep(0.06, 0.48, energySignal));

  float ambientBudget = 6.0;
  float localBudget = min(10.0, length(uRefractionPx));
  float displacementBudget = mix(ambientBudget, localBudget, localAmount) * layerWeight;
  vec2 refractedPx = flow * displacementBudget;
  vec2 followPx = vec2(clamp(uPatchFollowPx, -5.0, 5.0), 0.0)
    * localAmount * layerWeight;
  vec2 presentationDriftPx = vec2(
    sin(vUv.y * 11.0 + flow.x * 17.0 + ambientTime * 0.47),
    cos(vUv.x * 9.0 - flow.y * 19.0 - ambientTime * 0.31)
  ) * 2.2 * presentationIdle * layerWeight;
  vec2 combinedPx = refractedPx + followPx + presentationDriftPx;
  float combinedLength = length(combinedPx);
  if (combinedLength > 10.0) combinedPx *= 10.0 / combinedLength;
  vec2 displacedUv = clamp(vUv - combinedPx / uViewport, vec2(0.0), vec2(1.0));

  vec3 target = texture(tTarget, displacedUv).rgb;
  vec4 energy = texture(tEnergy, displacedUv);
  float displacedTargetMask = smoothstep(0.40, 0.42, displacedUv.y)
    * (1.0 - smoothstep(0.72, 0.74, displacedUv.y));
  vec3 energyPlate = mix(vec3(0.0196), energy.rgb, energy.a);
  vec3 authored = mix(energyPlate, target, displacedTargetMask);
  float gain = min(0.18, max(0.0, uCausticGain)) * localAmount * layerWeight;
  float authoredSignal = max(targetLuminance, energySignal);
  float emptySignal = 1.0 - smoothstep(0.015, 0.08, authoredSignal);
  float liquidWave = 0.5 + 0.5 * sin(
    vUv.x * 29.0 + sin(vUv.y * 23.0 + flow.y * 5.0) * 2.4 + flow.x * 6.0
  );
  float liquidGrain = smoothstep(0.16, 0.88, liquidWave);
  float emptyLift = emptySignal * localAmount * emptyWeight * 0.27 * (0.35 + 0.65 * liquidGrain);
  vec2 flowDx = dFdx(flow) * uViewport.x;
  vec2 flowDy = dFdy(flow) * uViewport.y;
  float curvature = abs(flowDx.y - flowDy.x) + 0.45 * abs(flowDx.x - flowDy.y);
  float causticCarrier = 0.5 + 0.25 * (
    sin(vUv.x * 29.0 + vUv.y * 17.0 + flow.x * 48.0 - flow.y * 31.0 + ambientTime * 0.83)
      + cos(vUv.x * 13.0 - vUv.y * 37.0 + flow.y * 43.0 - ambientTime * 0.61)
  );
  float causticCrest = smoothstep(0.66, 0.94, causticCarrier);
  float curvatureCrest = smoothstep(0.085, 0.24, curvature);
  float grazingLight = curvatureCrest
    * (0.08 + 0.92 * causticCrest)
    * (0.28 + 0.72 * liquidGrain)
    * 0.11
    * (1.0 - localAmount)
    * layerWeight;
  float centreField = 1.0 - smoothstep(
    0.04,
    0.28,
    abs(vUv.x - 0.58 + sin(ambientTime * 0.19 + flow.y * 13.0) * 0.018)
  );
  float breathCarrier = 0.5 + 0.5 * sin(
    ambientTime * 0.37 + vUv.y * 8.0 + flow.x * 21.0 - flow.y * 9.0
  );
  float centreBreath = curvatureCrest * centreField
    * (0.24 + 0.76 * breathCarrier)
    * (0.34 + 0.66 * liquidGrain)
    * presentationIdle * layerWeight * 0.10;
  float glyphEdge = smoothstep(0.015, 0.16, targetLuminance)
    * (1.0 - smoothstep(0.46, 0.88, targetLuminance));
  float edgeCarrier = 0.5 + 0.25 * (
    sin(vUv.x * 43.0 - vUv.y * 19.0 + ambientTime * 0.53 + flow.x * 27.0)
      + cos(vUv.x * 17.0 + vUv.y * 31.0 - ambientTime * 0.71 + flow.y * 23.0)
  );
  float edgeCrest = smoothstep(0.68, 0.95, edgeCarrier);
  float glyphShimmer = glyphEdge * edgeCrest * curvatureCrest
    * presentationIdle * 0.13;
  vec3 grazingTint = mix(
    vec3(0.76, 0.86, 0.90),
    vec3(0.92, 0.84, 0.76),
    smoothstep(-0.035, 0.035, flow.x)
  );
  vec3 color = min(
    vec3(1.0),
    authored + energy.rgb * gain + vec3(emptyLift)
      + grazingTint * (grazingLight + centreBreath)
      + vec3(0.94, 0.91, 0.86) * glyphShimmer
  );
  float interactionReplacement = smoothstep(0.0005, 0.012, flowLength)
    * mix(0.34, 1.0, localAmount);
  float replacement = mix(interactionReplacement, 1.0, uPresentationAlpha);
  fragColor = vec4(color, replacement);
}
`;
