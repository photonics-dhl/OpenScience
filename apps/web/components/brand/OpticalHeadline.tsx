import { OpticalField } from './OpticalField';

export interface OpticalHeadlineProps {
  locale: string;
  reducedMotion?: boolean;
}

function OpticalHeadline({ locale, reducedMotion = false }: OpticalHeadlineProps) {
  const headlineLines = (includeMarker: boolean) => (
    <span className="os-optical-headline-axis">
      <span className="os-optical-science font-display" data-optical-science="true">Science</span>
      <span
        className="os-optical-evolves font-editorial-latin"
        data-optical-evolves="true"
        data-optical-glyph-safe-zone="true"
      >
        evolves<span className="text-os-vermilion" {...(includeMarker ? { 'data-vermilion-marker': 'true' } : {})}>.</span>
      </span>
    </span>
  );

  return (
    <div className="relative" data-locale={locale} data-reduced-motion={reducedMotion ? 'true' : 'false'} data-optical-text-stage="true">
      <OpticalField reducedMotion={reducedMotion} />
      <h1 className="relative z-10 m-0 text-os-paper" data-headline-layout="single-axis" data-optical-text-base="true">
        {headlineLines(true)}
      </h1>
      <p className="font-editorial-cjk relative z-10 ml-auto mt-8 max-w-max border-t border-os-rule-dark pt-3 text-2xl text-os-paper sm:mr-[7vw] sm:text-4xl lg:text-5xl">
        科学，持续演化。
      </p>
    </div>
  );
}

export { OpticalHeadline };
