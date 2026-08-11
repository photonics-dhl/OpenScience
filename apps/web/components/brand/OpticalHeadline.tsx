import { OpticalField } from './OpticalField';

export interface OpticalHeadlineProps {
  locale: string;
  reducedMotion?: boolean;
}

function OpticalHeadline({ locale, reducedMotion = false }: OpticalHeadlineProps) {
  const headlineLines = (includeMarker: boolean) => (
    <span className="os-optical-headline-axis">
      <span className="os-optical-science font-display">Science</span>
      <span className="os-optical-gap"> </span>
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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 m-0 text-os-paper"
        data-headline-layout="single-axis"
        data-optical-text-distorted="true"
      >
        {headlineLines(false)}
      </div>
      <p className="font-editorial-cjk relative z-10 ml-auto mt-8 max-w-max border-t border-os-rule-dark pt-3 text-2xl text-os-paper sm:mr-[7vw] sm:text-4xl lg:text-5xl">
        科学，持续演化。
      </p>
      <svg aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <filter id="os-local-distortion" x="-25%" y="-40%" width="150%" height="180%" colorInterpolationFilters="sRGB">
          <feTurbulence baseFrequency="0.008 0.028" numOctaves="2" seed="12" result="noise" />
          <feDisplacementMap data-optical-displace="true" in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </div>
  );
}

export { OpticalHeadline };
