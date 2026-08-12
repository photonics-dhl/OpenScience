export const CONTINUOUS_TITLE_VERTEX_SHADER = /* glsl */ `
  uniform vec2 uDesignOffset;
  uniform float uDesignScale;
  uniform vec2 uDesignViewport;

  varying vec2 vDesignUv;

  void main() {
    vDesignUv = vec2(position.x + 0.5, 0.5 - position.y);
    vec2 designPosition = vDesignUv * uDesignViewport;
    vec2 screenPosition = designPosition * uDesignScale + uDesignOffset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(screenPosition, 0.0, 1.0);
  }
`;

export const CONTINUOUS_TITLE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec2 uDesignViewport;
  uniform float uDesignScale;
  uniform vec2 uFieldCenter;
  uniform float uMaxWarpCssPx;
  uniform float uPeriodMaxX;
  uniform float uPeriodMinX;
  uniform vec2 uPointer;
  uniform float uScienceMaxX;
  uniform sampler2D uTitleMask;
  uniform sampler2D uTouch;

  varying vec2 vDesignUv;

  void main() {
    float touch = texture2D(uTouch, vDesignUv).r;
    vec2 away = vDesignUv - uPointer;
    vec2 direction = away / max(length(away), 0.0001);
    float safeScale = max(uDesignScale, 0.0001);
    vec2 warpUv = direction * min(touch * uMaxWarpCssPx, uMaxWarpCssPx)
      / safeScale / uDesignViewport;
    vec2 sampleUv = clamp(vDesignUv - warpUv, vec2(0.0), vec2(1.0));
    float alpha = texture2D(uTitleMask, sampleUv).a;
    float designX = sampleUv.x * uDesignViewport.x;
    float seamEnergy = 1.0 - smoothstep(
      uDesignViewport.x * 0.012,
      uDesignViewport.x * 0.055,
      abs(designX - uFieldCenter.x)
    );
    alpha *= 1.0 - seamEnergy * 0.34;
    if (alpha <= 0.001) discard;

    vec3 science = vec3(0.93, 0.92, 0.89);
    vec3 evolves = vec3(0.88, 0.86, 0.81);
    vec3 vermilion = vec3(1.0, 0.18, 0.055);
    vec3 wordColor = mix(science, evolves, step(uScienceMaxX, designX));
    float period = step(uPeriodMinX, designX) * (1.0 - step(uPeriodMaxX, designX));
    gl_FragColor = vec4(mix(wordColor, vermilion, period), alpha);
  }
`;
