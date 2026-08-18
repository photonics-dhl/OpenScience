export const HERMES_PART_VERTEX_SHADER = /* glsl */ `#version 300 es
  precision highp float;
  in vec3 position;
  in vec2 uv;
  uniform vec2 uViewport;
  uniform vec3 uTorso;
  uniform vec3 uTail;
  uniform vec3 uForepaws;
  uniform vec3 uHead;
  uniform vec3 uCrown;
  uniform vec3 uEvidenceNodes;
  out vec2 vUv;

  float ellipse(vec2 point, vec2 center, vec2 radius, float feather) {
    float distanceValue = length((point - center) / radius);
    return 1.0 - smoothstep(1.0 - feather, 1.0 + feather, distanceValue);
  }

  float nodeMask(vec2 point) {
    float value = 0.0;
    value = max(value, ellipse(point, vec2(.457, .478), vec2(.042), .18));
    value = max(value, ellipse(point, vec2(.613, .460), vec2(.042), .18));
    value = max(value, ellipse(point, vec2(.745, .405), vec2(.042), .18));
    value = max(value, ellipse(point, vec2(.758, .285), vec2(.042), .18));
    value = max(value, ellipse(point, vec2(.650, .205), vec2(.042), .18));
    return value;
  }

  vec2 rigidDisplacement(vec2 point, vec2 pivot, vec3 pose) {
    vec2 local = point - pivot;
    float angle = radians(pose.z);
    float cosine = cos(angle);
    float sine = sin(angle);
    vec2 rotated = vec2(local.x * cosine - local.y * sine, local.x * sine + local.y * cosine);
    vec2 transformed = pivot + rotated + pose.xy / max(uViewport, vec2(1.0));
    return transformed - point;
  }

  void main() {
    vec2 point = uv;
    float torsoWeight = ellipse(uv, vec2(.415, .405), vec2(.255, .290), .22);
    float tailWeight = max(
      ellipse(uv, vec2(.655, .330), vec2(.315, .220), .18),
      ellipse(uv, vec2(.545, .155), vec2(.245, .125), .18)
    );
    tailWeight *= 1.0 - ellipse(uv, vec2(.380, .420), vec2(.205, .205), .16) * .86;
    float pawsWeight = max(
      ellipse(uv, vec2(.270, .335), vec2(.075, .110), .20),
      ellipse(uv, vec2(.370, .315), vec2(.078, .115), .20)
    );
    float headWeight = ellipse(uv, vec2(.315, .655), vec2(.235, .245), .20);
    float crownWeight = max(
      ellipse(uv, vec2(.275, .855), vec2(.105, .195), .18),
      ellipse(uv, vec2(.405, .830), vec2(.125, .170), .18)
    );

    torsoWeight *= .64;
    tailWeight *= .88;
    pawsWeight *= .92;
    headWeight *= .86;
    crownWeight *= .90;
    float evidenceWeight = nodeMask(uv) * .82;
    float totalWeight = torsoWeight + tailWeight + pawsWeight + headWeight + crownWeight + evidenceWeight;
    float normalizer = max(1.0, totalWeight);
    vec2 displacement = rigidDisplacement(uv, vec2(.43, .43), uTorso) * torsoWeight
      + rigidDisplacement(uv, vec2(.62, .39), uTail) * tailWeight
      + rigidDisplacement(uv, vec2(.30, .35), uForepaws) * pawsWeight
      + rigidDisplacement(uv, vec2(.34, .61), uHead) * headWeight
      + rigidDisplacement(uv, vec2(.35, .78), uCrown) * crownWeight
      + rigidDisplacement(uv, vec2(.56, .42), uEvidenceNodes) * evidenceWeight;
    point = uv + displacement / normalizer;
    vUv = uv;
    gl_Position = vec4(point * 2.0 - 1.0, position.z, 1.0);
  }
`;

export const HERMES_PART_FRAGMENT_SHADER = /* glsl */ `#version 300 es
  precision highp float;
  uniform sampler2D tIdle;
  uniform sampler2D tBlink;
  uniform sampler2D tWorking;
  uniform vec2 uGaze;
  uniform float uTextureMix;
  uniform float uWorking;
  uniform vec4 uEffect;
  in vec2 vUv;
  out vec4 outColor;

  void main() {
    float leftEye = 1.0 - smoothstep(.045, .095, distance(vUv, vec2(.205, .705)));
    float rightEye = 1.0 - smoothstep(.045, .105, distance(vUv, vec2(.365, .705)));
    float face = max(leftEye, rightEye);
    vec2 gazeUv = vUv - uGaze * .009 * face;
    vec4 idle = texture(tIdle, gazeUv);
    vec4 blink = texture(tBlink, gazeUv);
    vec4 working = texture(tWorking, gazeUv);
    vec4 resting = mix(idle, blink, clamp(uTextureMix, 0.0, 1.0));
    outColor = mix(resting, working, clamp(uWorking, 0.0, 1.0));
    if (outColor.a <= .001) discard;
    vec3 effectTint = uEffect.x * vec3(.16, .52, .70)
      + uEffect.y * vec3(.48, .64, .42)
      + uEffect.z * vec3(.64, .42, .18)
      + uEffect.w * vec3(.58, .36, .70);
    float inkEdge = smoothstep(.025, .22, outColor.a) * (1.0 - smoothstep(.70, .98, outColor.a));
    outColor.rgb += effectTint * inkEdge * .18;
  }
`;
