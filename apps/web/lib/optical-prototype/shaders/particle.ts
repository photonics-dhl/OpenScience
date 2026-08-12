export const CENTRAL_PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute vec2 aHome;
  attribute float aGroup;

  uniform vec2 uDesignViewport;
  uniform vec2 uDesignOffset;
  uniform float uDesignScale;
  uniform vec2 uPointer;
  uniform sampler2D uTouch;

  varying float vGroup;
  varying vec2 vQuadUv;

  void main() {
    vec2 homeUv = aHome / uDesignViewport;
    float touch = texture2D(uTouch, homeUv).r;
    vec2 away = homeUv - uPointer;
    float awayLength = max(length(away), 0.0001);
    vec2 displaced = aHome * uDesignScale + uDesignOffset + (away / awayLength) * touch * 10.0;
    float particleSize = mix(2.2, 2.8, step(1.5, aGroup));
    vec2 particlePosition = displaced + position.xy * particleSize;
    vGroup = aGroup;
    vQuadUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(particlePosition, 0.0, 1.0);
  }
`;

export const CENTRAL_PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  varying float vGroup;
  varying vec2 vQuadUv;

  void main() {
    float distanceFromCenter = length(vQuadUv - vec2(0.5));
    float alpha = 1.0 - smoothstep(0.32, 0.5, distanceFromCenter);
    if (alpha <= 0.001) discard;
    vec3 science = vec3(0.93, 0.92, 0.89);
    vec3 evolves = vec3(0.88, 0.86, 0.81);
    vec3 vermilion = vec3(1.0, 0.18, 0.055);
    vec3 wordColor = mix(science, evolves, step(0.5, vGroup));
    vec3 color = mix(wordColor, vermilion, step(1.5, vGroup));
    gl_FragColor = vec4(color, alpha);
  }
`;
