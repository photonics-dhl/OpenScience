export const OPTICAL_ASSET_FLOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D tPrevious;
uniform vec2 uPointer;
uniform vec2 uVelocity;
uniform float uAmbientPhase;
uniform float uAspect;
uniform float uFresh;
uniform float uLocalStrength;
uniform float uRadius;

in vec2 vUv;
out vec4 fragColor;

const float PI = 3.141592653589793;

void main() {
  vec2 backtraceUv = clamp(vUv - uVelocity * uLocalStrength * 0.009, vec2(0.0), vec2(1.0));
  vec4 previousSample = texture(tPrevious, backtraceUv);
  vec2 stored = previousSample.xy * 2.0 - 1.0;
  vec2 previous = mix(stored, vec2(0.0), uFresh);
  float previousLocal = mix(previousSample.z, 0.0, uFresh);
  float previousCarrier = mix(previousSample.w * 2.0 - 1.0, 0.0, uFresh);

  float phase = uAmbientPhase * 2.0 * PI;
  vec2 ambient = vec2(
    sin(vUv.y * 8.0 + phase) + cos((vUv.x + vUv.y) * 5.0 - phase * 0.73),
    cos(vUv.x * 7.0 - phase * 0.61) - sin((vUv.x - vUv.y) * 6.0 + phase)
  );
  float ambientMagnitude = length(ambient);
  if (ambientMagnitude > 0.0) ambient *= min(0.05, ambientMagnitude) / ambientMagnitude;

  vec2 direction = normalize(uVelocity + vec2(0.0001, 0.0));
  vec2 localDelta = vec2(vUv.x - uPointer.x, (vUv.y - uPointer.y) / max(0.001, uAspect))
    + direction * uRadius * 0.04;
  vec2 normal = vec2(-direction.y, direction.x);
  float along = dot(localDelta, direction);
  float across = dot(localDelta, normal);
  float transverseRadius = min(uRadius, 0.14);
  float irregular = sin((along * 29.0 + across * 41.0) / max(0.001, uRadius) + phase)
    * transverseRadius * 0.055;
  vec2 wakeDistance = vec2(
    (along + irregular) / max(0.001, uRadius * 1.12),
    (across - irregular * 0.7) / max(0.001, transverseRadius * 0.54)
  );
  float localDistance = length(wakeDistance);
  float influence = (1.0 - smoothstep(0.28, 1.0, localDistance)) * uLocalStrength;
  float carrierIrregular = sin(
    (along * 29.0 + across * 41.0) / max(0.001, uRadius)
  ) * transverseRadius * 0.055;
  vec2 carrierDistance = vec2(
    (along + carrierIrregular) / max(0.001, uRadius * 1.12),
    (across - carrierIrregular * 0.7) / max(0.001, transverseRadius * 0.54)
  );
  float carrierSupport = 1.0 - smoothstep(0.28, 1.0, length(carrierDistance));
  float carrierWave = sin(
    along * 31.0 / max(0.001, uRadius)
      + across * 17.0 / max(0.001, transverseRadius)
  );
  float shapedCarrierWave = sign(carrierWave) * (0.5 + 0.5 * abs(carrierWave));
  float carrier = clamp(
    mix(previousCarrier * 0.72, carrierSupport * shapedCarrierWave, uLocalStrength),
    -1.0,
    1.0
  ) * step(0.0001, uLocalStrength);
  float localPersistence = step(0.0001, previousLocal);
  vec2 velocity = previous * 0.985 * localPersistence + ambient + uVelocity * influence * 0.24;
  float magnitude = length(velocity);
  if (magnitude > 1.0) velocity /= magnitude;
  float localMemory = min(uLocalStrength, max(previousLocal * 0.94, influence));
  fragColor = vec4(velocity * 0.5 + 0.5, localMemory, carrier * 0.5 + 0.5);
}
`;
