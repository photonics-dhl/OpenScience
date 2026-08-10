import { OpticalField } from './OpticalField';

export interface OpticalHeadlineProps {
  locale: string;
  reducedMotion?: boolean;
  variant?: 'editorial' | 'sculptural';
}

function OpticalHeadline({ locale, reducedMotion = false, variant = 'editorial' }: OpticalHeadlineProps) {
  const sculptural = variant === 'sculptural';
  const renderHeadline = (includeMarker: boolean) => (
    <h1 className={`m-0 tracking-[-0.075em] text-os-paper ${sculptural ? 'leading-[0.82]' : 'leading-[0.78]'}`}>
      <span className={`block font-display font-semibold ${sculptural ? 'text-[clamp(4.25rem,8.6vw,8.5rem)]' : 'text-[clamp(4.7rem,13.5vw,13rem)]'}`}>Science</span>
      <span className={`block font-editorial font-normal italic tracking-[-0.09em] ${sculptural ? 'ml-[0.08em] text-[clamp(4.6rem,9.4vw,9.2rem)]' : 'ml-[8vw] text-[clamp(5.2rem,15vw,14rem)] sm:ml-[18vw]'}`}>
        evolves<span className="text-os-vermilion" {...(includeMarker ? { 'data-vermilion-marker': 'true' } : {})}>.</span>
      </span>
    </h1>
  );

  return (
    <div className="relative" data-locale={locale} data-reduced-motion={reducedMotion ? 'true' : 'false'} data-optical-text-stage="true">
      <OpticalField reducedMotion={reducedMotion} />
      <div className="relative z-10" data-optical-text-base="true">{renderHeadline(true)}</div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 optical-text-distorted" data-optical-text-distorted="true">{renderHeadline(false)}</div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 optical-text-chromatic" data-optical-text-chromatic="true">{renderHeadline(false)}</div>
      <p className={`relative z-10 mt-6 max-w-max border-t border-os-rule-dark pt-3 font-editorial tracking-[-0.04em] text-os-paper ${sculptural ? 'ml-[0.4rem] text-[clamp(1.25rem,2.1vw,2.2rem)]' : 'ml-auto text-[clamp(1.5rem,3.2vw,3.6rem)] sm:mr-[7vw]'}`}>
        科学，持续演化。
      </p>
      <div aria-hidden="true" className="pointer-events-none absolute z-30 optical-cursor-ring" />
      <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 z-30 hidden font-data text-[10px] uppercase tracking-[0.12em] text-os-muted-dark sm:block">MOVE POINTER ACROSS THE TYPE</span>
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
