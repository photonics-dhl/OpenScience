import { Archivo } from 'next/font/google';

import styles from '@/app/_visual/optical-lab/optical-lab.module.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: '900',
  display: 'swap',
});

export const opticalTypographyCandidates = [
  'bricolage',
  'archivo',
  'arial-black-reference',
] as const;

export type OpticalTypographyCandidate = (typeof opticalTypographyCandidates)[number];

export function isOpticalTypographyCandidate(value: string | undefined): value is OpticalTypographyCandidate {
  return opticalTypographyCandidates.some((candidate) => candidate === value);
}

export function OpticalLabTypographySpecimen({ candidate }: { candidate: OpticalTypographyCandidate }) {
  const shippingEligible = candidate !== 'arial-black-reference';
  const candidateClassName = candidate === 'archivo'
    ? `${styles.typographyArchivo} ${archivo.className}`
    : candidate === 'arial-black-reference'
      ? styles.typographyArialBlackReference
      : styles.typographyBricolage;

  return (
    <main
      className={`${styles.typographySpecimen} ${candidateClassName}`}
      data-optical-aperture="0.58"
      data-optical-specimen="true"
      data-optical-specimen-candidate={candidate}
      data-shipping-eligible={String(shippingEligible)}
    >
      <div aria-hidden="true" className={styles.typographyApertureGuide} data-optical-aperture-guide="true" />
      <div aria-hidden="true" className={styles.typographyBaselineGuide} data-optical-baseline="true" />
      <h1 className={styles.typographyHeadline} data-optical-selectable="true">
        <span className={styles.typographyScience} data-optical-science="true"><span className={styles.typographyScienceInk}>Science</span></span>{' '}
        <span className={styles.typographyEvolves} data-optical-evolves="true"><span className={styles.typographyEvolvesInk}>evolves.</span></span>
      </h1>
    </main>
  );
}
