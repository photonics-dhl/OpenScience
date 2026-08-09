import { OpticalField } from './OpticalField';

export interface OpticalHeadlineProps {
  locale: string;
  reducedMotion?: boolean;
}

function OpticalHeadline({ locale, reducedMotion = false }: OpticalHeadlineProps) {
  return (
    <div className="relative" data-locale={locale} data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <OpticalField reducedMotion={reducedMotion} />
      <h1 className="relative z-10 m-0 leading-[0.78] tracking-[-0.075em] text-os-paper">
        <span className="block font-display text-[clamp(4.7rem,13.5vw,13rem)] font-semibold">Science</span>
        <span className="ml-[8vw] block font-editorial text-[clamp(5.2rem,15vw,14rem)] font-normal italic tracking-[-0.09em] sm:ml-[18vw]">
          evolves<span className="text-os-vermilion" data-vermilion-marker="true">.</span>
        </span>
      </h1>
      <p className="relative z-10 ml-auto mt-8 max-w-max border-t border-os-rule-dark pt-3 font-editorial text-[clamp(1.5rem,3.2vw,3.6rem)] tracking-[-0.04em] text-os-paper sm:mr-[7vw]">
        科学，持续演化。
      </p>
    </div>
  );
}

export { OpticalHeadline };
