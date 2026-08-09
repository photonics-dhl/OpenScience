import { notFound } from 'next/navigation';

import IngestionFoundationsPreview from '../../_visual/ingestion-foundations/page';

export default function VisualRegressionPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return <IngestionFoundationsPreview />;
}
