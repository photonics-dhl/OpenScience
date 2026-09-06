import type { Metadata } from 'next';
import { ResearchJourneyReview } from '@/components/visual/ResearchJourneyReview';

export const metadata: Metadata = { title: 'OpenScience · Research journey review', robots: { index: false, follow: false } };

export default function ResearchJourneyReviewPage() {
  return <ResearchJourneyReview />;
}
