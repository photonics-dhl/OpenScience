import type { Metadata } from 'next';

import {
  isOpticalTypographyCandidate,
  OpticalLabTypographySpecimen,
} from '@/components/optical-lab/OpticalLabTypographySpecimen';

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'Optical Lab Typography Specimen · OpenScience',
};

export default function OpticalLabTypographySpecimenRoute({
  searchParams,
}: {
  searchParams?: { candidate?: string };
}) {
  const candidate = isOpticalTypographyCandidate(searchParams?.candidate)
    ? searchParams.candidate
    : 'archivo';

  return <OpticalLabTypographySpecimen candidate={candidate} />;
}
