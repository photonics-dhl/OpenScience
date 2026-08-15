import { OpticalLabPage, opticalLabMetadata } from '@/components/optical-lab/OpticalLabPage';

export const metadata = opticalLabMetadata;

export default async function OpticalLabVisualRoute({
  searchParams,
}: {
  searchParams?: { candidate?: string | string[] };
} = {}) {
  return OpticalLabPage({ candidate: searchParams?.candidate === 'asset' ? 'asset' : undefined });
}
