'use client';
import { ResearchPublication } from '@/components/research/ResearchPublication';
export default function PublishPage({ params }: { params: { id: string } }) { return <ResearchPublication researchObjectId={params.id} />; }
