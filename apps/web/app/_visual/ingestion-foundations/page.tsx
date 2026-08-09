'use client';

import { Dropzone } from '@/components/ui/dropzone';
import { EvidenceCard } from '@/components/ui/evidence-card';
import { ProgressRail } from '@/components/ui/progress-rail';

const ignore = () => undefined;

export default function IngestionFoundationsPreview() {
  return (
    <main
      className="min-h-screen bg-workbench-bg px-4 py-3 text-workbench-text sm:px-8 sm:py-8 lg:px-14 lg:py-12"
      data-ingestion-foundations-preview
    >
      <header className="mb-2 flex flex-col gap-1 sm:mb-6 sm:gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <h1 className="max-w-3xl font-display text-2xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          Evidence-led scholarly cockpit
        </h1>
        <p className="max-w-md text-[0.6875rem] leading-4 text-workbench-muted sm:text-sm sm:leading-6">
          Canonical ingestion foundations with solid hierarchy, paper evidence, and explicit
          source anchors.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:gap-5">
        <Dropzone
          className="min-h-32 gap-1 px-3 py-2 [&>span:first-of-type]:h-8 [&>span:first-of-type]:w-8 [&>span:nth-of-type(2)]:text-sm [&>span:nth-of-type(3)]:text-xs [&>span:nth-of-type(3)]:leading-4 [&>span:last-of-type]:py-1.5 sm:min-h-48 sm:gap-3 sm:px-6 sm:py-8 sm:[&>span:first-of-type]:h-12 sm:[&>span:first-of-type]:w-12 sm:[&>span:nth-of-type(2)]:text-base sm:[&>span:nth-of-type(3)]:text-sm sm:[&>span:nth-of-type(3)]:leading-6 sm:[&>span:last-of-type]:py-2 lg:min-h-64"
          onFiles={ignore}
        />
        <ProgressRail
          className="min-h-28 gap-2 p-3 [&>p]:text-xs sm:min-h-32 sm:gap-3 sm:p-4 sm:[&>p]:text-sm"
          current={2}
          total={6}
          state="parsing"
        />
      </div>

      <EvidenceCard
        className="mt-2 p-3 [&>dl]:gap-1 [&>dl]:pt-2 [&>footer]:mt-2 [&>footer]:min-h-0 [&>footer]:pt-2 [&>p]:my-2 [&>p]:text-sm [&>p]:leading-5 sm:mt-5 sm:p-5 sm:[&>dl]:gap-2 sm:[&>dl]:pt-3 sm:[&>footer]:mt-5 sm:[&>footer]:min-h-10 sm:[&>footer]:pt-4 sm:[&>p]:my-4 sm:[&>p]:text-base sm:[&>p]:leading-7"
        field="Method"
        value="Time-resolved photoelectron spectroscopy resolves the transient state across a 35 fs probe window."
        status="inferred"
        confidence="high"
        source="methods.pdf · p. 4"
        onConfirm={ignore}
        onEdit={ignore}
        onReject={ignore}
      />
    </main>
  );
}
