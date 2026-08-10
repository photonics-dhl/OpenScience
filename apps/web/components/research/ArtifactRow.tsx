export interface ArtifactRowProps {
  meta?: string;
  name: string;
  status: string;
}

function ArtifactRow({ meta, name, status }: ArtifactRowProps) {
  return (
    <div className="grid gap-2 border-b border-os-rule-dark py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-baseline" data-artifact-row="true">
      <span className="min-w-0 truncate text-os-paper">{name}</span>
      {meta && <span className="font-data text-[10px] uppercase tracking-[0.1em] text-os-muted-dark">{meta}</span>}
      <span className="font-data text-[10px] uppercase tracking-[0.1em] text-os-muted-dark">{status}</span>
    </div>
  );
}

export { ArtifactRow };
