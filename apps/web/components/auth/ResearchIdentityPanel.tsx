import * as React from 'react';

export interface ResearchIdentityPanelProps {
  description: string;
  eyebrow: string;
  intent: 'create' | 'return';
  tagline: string;
  title: string;
}

function ResearchIdentityPanel({ description, eyebrow, intent, tagline, title }: ResearchIdentityPanelProps) {
  return (
    <section className="relative w-full overflow-hidden" data-research-identity-context={intent}>
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-os-rule-dark" />
      <div aria-hidden="true" className="absolute right-[18%] top-[18%] h-36 w-px bg-os-rule-dark" />
      <p className="relative font-mono text-[0.65rem] uppercase tracking-[0.24em] text-os-muted-dark">{eyebrow}</p>
      <h2 className="relative mt-12 max-w-[9ch] font-editorial text-[clamp(3.4rem,6vw,6.8rem)] font-normal leading-[0.9] tracking-[-0.055em] text-os-paper">
        {title}
      </h2>
      <p className="relative mt-10 max-w-sm border-l border-os-vermilion pl-5 text-sm leading-7 text-os-muted-dark">
        {description}
      </p>
      <div aria-hidden="true" className="relative mt-14 flex items-center gap-3 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-os-muted-dark">
        <span className="h-1.5 w-1.5 bg-os-vermilion" />
        <span>{tagline}</span>
      </div>
    </section>
  );
}

export { ResearchIdentityPanel };
