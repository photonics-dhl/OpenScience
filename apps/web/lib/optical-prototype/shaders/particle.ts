export const CENTRAL_PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute vec2 aHome;
  attribute float aGroup;
  attribute float aId;
  attribute float aOpacity;
  attribute float aPhase;
  attribute float aRole;

  uniform vec2 uDesignViewport;
  uniform vec2 uDesignOffset;
  uniform float uDesignScale;
  uniform vec2 uFieldCenter;
  uniform vec2 uPointer;
  uniform float uTimeMs;
  uniform sampler2D uTouch;

  varying float vGroup;
  varying float vOpacity;
  varying vec2 vQuadUv;

  void main() {
    vec2 homeUv = aHome / uDesignViewport;
    float touch = texture2D(uTouch, homeUv).r;
    vec2 away = homeUv - uPointer;
    float awayLength = max(length(away), 0.0001);
    vec2 delta = aHome - uFieldCenter;
    float distanceFromCenter = max(length(delta), 0.0001);
    vec2 radialDirection = delta / distanceFromCenter;
    vec2 tangentDirection = vec2(-radialDirection.y, radialDirection.x);
    float stable = fract((aId + 1.0) * 0.61803398875);
    float seam = clamp(1.0 - abs(delta.x) / (uDesignViewport.x * 0.055), 0.0, 1.0);
    float energy = seam * seam;
    float groupEnergy = mix(1.0, 0.9, step(0.5, aGroup));
    vec2 radial = -radialDirection * energy * groupEnergy * (10.0 + stable * 8.0);
    vec2 tangent = tangentDirection * energy * (5.0 + stable * 4.0);
    vec2 emission = vec2(
      energy * (20.0 + stable * 14.0),
      energy * sin(uTimeMs * 0.0007 + stable * 6.2831853) * 2.5
    );
    vec2 glyphField = radial + tangent + emission;
    vec2 curtainField = vec2(
      sin(uTimeMs * 0.00035 + aPhase * 6.2831853) * 1.8,
      cos(uTimeMs * 0.00027 + aPhase * 6.2831853) * 0.8
    );
    vec2 restingField = mix(glyphField, curtainField, step(0.5, aRole));
    float pointerCap = min(min(touch * 4.0, length(restingField) * 0.35), 4.0);
    vec2 pointerField = (away / awayLength) * pointerCap;
    vec2 displaced = (aHome + restingField) * uDesignScale + uDesignOffset + pointerField;
    float glyphSize = 2.2;
    float curtainSize = mix(1.4, 2.2, aOpacity);
    float particleSize = mix(glyphSize, curtainSize, step(0.5, aRole));
    vec2 particlePosition = displaced + position.xy * particleSize;
    vGroup = aGroup;
    vOpacity = mix(1.0, aOpacity, step(0.5, aRole));
    vQuadUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(particlePosition, 0.0, 1.0);
  }
`;

export const CENTRAL_PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  varying float vGroup;
  varying float vOpacity;
  varying vec2 vQuadUv;

  void main() {
    float distanceFromCenter = length(vQuadUv - vec2(0.5));
    float alpha = (1.0 - smoothstep(0.32, 0.5, distanceFromCenter)) * vOpacity;
    if (alpha <= 0.001) discard;
    vec3 science = vec3(0.93, 0.92, 0.89);
    vec3 evolves = vec3(0.88, 0.86, 0.81);
    vec3 vermilion = vec3(1.0, 0.18, 0.055);
    vec3 wordColor = mix(science, evolves, step(0.5, vGroup));
    vec3 color = mix(wordColor, vermilion, step(1.5, vGroup));
    gl_FragColor = vec4(color, alpha);
  }
`;
