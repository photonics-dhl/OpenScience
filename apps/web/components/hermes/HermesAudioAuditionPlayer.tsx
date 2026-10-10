'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { downloadPresentationTaskAudio, presentationTaskAudioUrl } from '@/lib/api';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : React.useLayoutEffect;

type Props = { ownerId: string; researchObjectId: string; versionId: string; taskId: string; caption?: string };

export function HermesAudioAuditionPlayer(props: Props) {
  return <AudioPlayer key={JSON.stringify([props.ownerId, props.researchObjectId, props.versionId, props.taskId])} {...props} />;
}

function AudioPlayer({ researchObjectId, versionId, taskId, caption }: Props) {
  const t = useTranslations('hermesAudioAudition');
  const audio = useRef<HTMLAudioElement>(null);
  const active = useRef(true);
  const downloadRequest = useRef<AbortController | null>(null);
  const downloadUrl = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const source = presentationTaskAudioUrl(researchObjectId, versionId, taskId);
  useClientLayoutEffect(() => {
    active.current = true;
    const player = audio.current;
    // Development effect replay reuses the node after cleanup removed its old source.
    if (player && player.getAttribute('src') !== source) player.setAttribute('src', source);
    return () => {
      active.current = false;
      downloadRequest.current?.abort();
      player?.pause();
      player?.removeAttribute('src');
      player?.load();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, [source]);

  async function download() {
    if (downloadRequest.current) return;
    const controller = new AbortController();
    downloadRequest.current = controller;
    setDownloading(true); setDownloadFailed(false); setDownloadStarted(false);
    try {
      const blob = await downloadPresentationTaskAudio(researchObjectId, versionId, taskId, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl.current; link.download = 'hermes-narration.mp3';
      document.body.append(link); link.click(); link.remove();
      setDownloadStarted(true);
    } catch {
      if (active.current && !controller.signal.aborted) setDownloadFailed(true);
    } finally {
      if (downloadRequest.current === controller) downloadRequest.current = null;
      if (active.current) setDownloading(false);
    }
  }

  return <section className="border-t border-os-rule-paper py-4" aria-label={t('title')} data-hermes-audio-audition="true">
    <div className="flex items-center justify-between gap-3">
      <div><h3 className="m-0 text-base font-medium text-os-ink">{t('title')}</h3>{caption && <p className="m-0 mt-1 text-sm text-os-muted-paper">{caption}</p>}</div>
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm text-os-ink transition-colors hover:bg-os-paper-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink disabled:opacity-50" disabled={downloading} onClick={() => void download()}>
        <Download className="size-4" aria-hidden="true" />{t(downloading ? 'downloading' : 'download')}
      </button>
    </div>
    <audio ref={audio} className="mt-2 w-full" controls preload="none" aria-label={t('title')}
      src={source}
      onLoadStart={() => { if (audio.current && !audio.current.paused) setLoading(true); setPlaybackFailed(false); }}
      onPlay={() => { if (audio.current && audio.current.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) setLoading(true); }}
      onWaiting={() => setLoading(true)}
      onPlaying={() => setLoading(false)}
      onCanPlay={() => { setLoading(false); setPlaybackFailed(false); }}
      onError={() => { setLoading(false); setPlaybackFailed(true); }} />
    {loading && <p className="mt-2 text-sm text-os-muted-paper" role="status">{t('loading')}</p>}
    {playbackFailed && <div className="mt-2 flex flex-wrap items-center gap-3">
      <p className="m-0 text-sm text-state-danger" role="alert">{t('playbackFailed')}</p>
      <button type="button" className="min-h-11 text-sm text-os-ink underline" onClick={() => { setPlaybackFailed(false); setLoading(true); audio.current?.load(); }}>{t('reload')}</button>
    </div>}
    {downloadFailed && <p className="mt-2 text-sm text-state-danger" role="alert">{t('downloadFailed')}</p>}
    {downloadStarted && <p className="mt-2 text-sm text-os-muted-paper" role="status">{t('downloadStarted')}</p>}
  </section>;
}
