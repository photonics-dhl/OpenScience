'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type PreviewKind = 'pdf' | 'image';

const PREVIEW_TYPES: Record<string, { kind: PreviewKind; mimeType: string }> = {
  pdf: { kind: 'pdf', mimeType: 'application/pdf' },
  png: { kind: 'image', mimeType: 'image/png' },
  jpg: { kind: 'image', mimeType: 'image/jpeg' },
  jpeg: { kind: 'image', mimeType: 'image/jpeg' },
  gif: { kind: 'image', mimeType: 'image/gif' },
  webp: { kind: 'image', mimeType: 'image/webp' },
  avif: { kind: 'image', mimeType: 'image/avif' },
};

function previewTypeFor(logicalPath: string) {
  const extension = logicalPath.split('.').pop()?.toLowerCase();
  return extension ? PREVIEW_TYPES[extension] : undefined;
}

async function hasPdfSignature(blob: Blob) {
  const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  return bytes.length === 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export function ArtifactViewer({ artifactId, logicalPath }: { artifactId: string; logicalPath: string }) {
  const t = useTranslations('attachmentViewer');
  const previewType = previewTypeFor(logicalPath);
  const objectUrl = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const requestAbort = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<{ kind: PreviewKind; url: string } | null>(null);

  const revokePreview = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }, []);

  const releasePreview = useCallback(() => {
    revokePreview();
    setPreview(null);
  }, [revokePreview]);

  const cancelRequest = useCallback(() => {
    requestVersion.current += 1;
    requestAbort.current?.abort();
    requestAbort.current = null;
  }, []);

  const closePreview = useCallback(() => {
    cancelRequest();
    setOpen(false);
    setLoading(false);
    setError(false);
    releasePreview();
  }, [cancelRequest, releasePreview]);

  useEffect(() => () => {
    cancelRequest();
    revokePreview();
  }, [cancelRequest, revokePreview]);
  useEffect(() => { closePreview(); }, [artifactId, logicalPath, closePreview]);

  async function openPreview() {
    if (!previewType) return;
    cancelRequest();
    const requestId = ++requestVersion.current;
    const controller = new AbortController();
    requestAbort.current = controller;
    setOpen(true);
    setLoading(true);
    setError(false);
    releasePreview();
    try {
      const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/download`, { credentials: 'include', signal: controller.signal });
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!response.ok || contentType !== previewType.mimeType) throw new Error('PREVIEW_UNAVAILABLE');
      const blob = await response.blob();
      if (requestId !== requestVersion.current) return;
      if (previewType.kind === 'pdf' && !await hasPdfSignature(blob)) throw new Error('PREVIEW_UNAVAILABLE');
      if (requestId !== requestVersion.current) return;
      const url = URL.createObjectURL(new Blob([blob], { type: contentType }));
      objectUrl.current = url;
      setPreview({ kind: previewType.kind, url });
    } catch {
      if (requestId === requestVersion.current) setError(true);
    } finally {
      if (requestId === requestVersion.current) requestAbort.current = null;
      if (requestId === requestVersion.current) setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {previewType ? <button className="min-h-9 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" type="button" onClick={() => void openPreview()}>{t('preview')}</button> : null}
      <a className="min-h-9 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" download href={`/api/artifacts/${encodeURIComponent(artifactId)}/download`}>{t('download')}</a>
      {previewType ? <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closePreview(); }}>
        <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto border-os-rule-paper bg-os-paper p-4 sm:p-6" onEscapeKeyDown={closePreview}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="break-all font-editorial text-2xl font-normal text-os-ink">{logicalPath}</DialogTitle>
              <DialogDescription className="mt-2 text-os-muted-paper">{t('safePreviewNotice')}</DialogDescription>
            </div>
            <DialogClose asChild><button className="min-h-10 shrink-0 rounded-panel border border-os-rule-paper px-3 text-sm text-os-ink" type="button">{t('close')}</button></DialogClose>
          </div>
          <div className="mt-5 min-h-48 border border-os-rule-paper bg-os-paper-strong">
            {loading ? <p className="p-5 text-sm text-os-muted-paper" role="status">{t('loading')}</p> : null}
            {error ? <p className="p-5 text-sm text-os-vermilion" role="alert">{t('unavailable')}</p> : null}
            {preview?.kind === 'image' ? <img alt={logicalPath} className="mx-auto max-h-[65dvh] w-auto max-w-full object-contain" src={preview.url} /> : null}
            {preview?.kind === 'pdf' ? <object aria-label={t('documentTitle', { name: logicalPath })} className="h-[65dvh] w-full bg-white" data={preview.url} type="application/pdf"><p className="p-5 text-sm text-os-ink">{t('unavailable')}</p></object> : null}
          </div>
          {error ? <a className="mt-4 inline-flex min-h-10 items-center underline underline-offset-4" download href={`/api/artifacts/${encodeURIComponent(artifactId)}/download`}>{t('download')}</a> : null}
        </DialogContent>
      </Dialog> : null}
    </div>
  );
}
