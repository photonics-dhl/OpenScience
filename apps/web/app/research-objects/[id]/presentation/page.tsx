'use client';
import { ResearchPresentation } from '@/components/presentation/ResearchPresentation';
export default function PresentationPage({ params }: { params: { id: string } }) { return <ResearchPresentation params={params} />; }
