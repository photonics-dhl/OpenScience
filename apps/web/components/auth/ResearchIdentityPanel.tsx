import * as React from 'react';

interface ResearchIdentityPanelProps {
  description: string;
  eyebrow: string;
  intent: 'create' | 'return';
  tagline: string;
  title: string;
}

function ResearchIdentityPanel({ description, eyebrow, intent, tagline, title }: ResearchIdentityPanelProps) {
  return (
    <section className="relative w-full border-t border-os-rule-paper pt-6" data-research-identity-context={intent}>
      <p data-reading-role="caption" className="relative font-data text-os-vermilion-ink">{eyebrow}</p>
      <h2 className="relative mt-5 max-w-[14ch] font-reading text-[clamp(2rem,3.4vw,3.5rem)] font-normal leading-[1.06] tracking-[-0.035em] text-os-ink">
        {title}
      </h2>
      <p className="relative mt-6 max-w-md border-l-2 border-os-vermilion-ink pl-5 text-base leading-7 text-os-muted-paper">
        {description}
      </p>
      <div aria-hidden="true" className="relative mt-8 flex items-center gap-3 text-xs text-os-muted-paper">
        <span className="h-1.5 w-1.5 bg-os-vermilion-ink" />
        <span>{tagline}</span>
      </div>
    </section>
  );
}

export { ResearchIdentityPanel };
