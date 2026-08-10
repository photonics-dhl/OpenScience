import { OpticalField } from './OpticalField';

export interface OpticalHeadlineProps {
  locale: string;
  reducedMotion?: boolean;
}

function OpticalHeadline({ locale, reducedMotion = false }: OpticalHeadlineProps) {
  const headlineLines = (includeMarker: boolean) => (
    <>
      <span className="block font-display text-[clamp(4.7rem,13.5vw,13rem)] font-semibold">Science</span>
      <span
        className="ml-[8vw] block pb-[0.13em] font-editorial text-[clamp(5.2rem,15vw,14rem)] font-normal italic tracking-[-0.09em] sm:ml-[18vw]"
        data-optical-glyph-safe-zone="true"
      >
        evolves<span className="text-os-vermilion" {...(includeMarker ? { 'data-vermilion-marker': 'true' } : {})}>.</span>
      </span>
    </>
  );

  return (
    <div className="relative" data-locale={locale} data-reduced-motion={reducedMotion ? 'true' : 'false'} data-optical-text-stage="true">
      <OpticalField reducedMotion={reducedMotion} />
      <h1 className="relative z-10 m-0 leading-[0.82] tracking-[-0.075em] text-os-paper" data-optical-text-base="true">
        {headlineLines(true)}
      </h1>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 m-0 leading-[0.82] tracking-[-0.075em] text-os-paper"
        data-optical-text-distorted="true"
      >
        {headlineLines(false)}
      </div>
      <p className="relative z-10 ml-auto mt-8 max-w-max border-t border-os-rule-dark pt-3 font-editorial text-[clamp(1.5rem,3.2vw,3.6rem)] tracking-[-0.04em] text-os-paper sm:mr-[7vw]">
        科学，持续演化。
      </p>
      <div aria-hidden="true" className="pointer-events-none absolute z-30 optical-cursor-ring" />
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
