import * as React from 'react';

const PARTICLES = Array.from({ length: 18 }, (_, index) => ({
  index,
  left: `${8 + ((index * 17) % 82)}%`,
  top: `${12 + ((index * 29) % 70)}%`,
  delay: `${(index % 6) * 0.7}s`,
  size: `${2 + (index % 3)}px`,
}));

export default function EvidenceField() {
  return (
    <div className="evidence-field" data-evidence-field data-particle-count="18" aria-hidden="true">
      <span className="evidence-field__trace evidence-field__trace--one" />
      <span className="evidence-field__trace evidence-field__trace--two" />
      {PARTICLES.map((particle) => (
        <span
          className="evidence-field__particle"
          data-particle-index={particle.index}
          key={particle.index}
          style={{ left: particle.left, top: particle.top, animationDelay: particle.delay, width: particle.size, height: particle.size }}
        />
      ))}
    </div>
  );
}
