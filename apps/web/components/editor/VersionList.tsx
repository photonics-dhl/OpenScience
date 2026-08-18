'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { VersionLite } from './OutlinePanel';

const PAGE_SIZE = 20;

/** 窗口分页纯函数（§18.3 虚拟化，单测）。 */
export function pageVersions<T>(items: T[], limit: number): T[] {
  return items.slice(0, Math.max(0, limit));
}

/** 版本列表窗口虚拟化（§18.3 大文件列表虚拟化）：前 N + 滚动加载，无第三方库。 */
export default function VersionList({
  versions,
  onSelect,
  activeVersionId,
}: {
  versions: VersionLite[];
  onSelect: (versionId: string) => void;
  activeVersionId?: string;
}) {
  const t = useTranslations('editor');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 滚动到底加载更多（IntersectionObserver）
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && limit < versions.length) {
        setLimit((n) => Math.min(n + PAGE_SIZE, versions.length));
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, versions.length]);

  const shown = versions.slice(0, limit);

  return (
    <div>
      <h3 data-reading-role="caption" className="m-0 border-b border-os-rule-dark pb-3 font-data uppercase tracking-[0.1em] text-os-muted-dark">{t('versions')}</h3>
      {shown.map((v) => (
        <button
          key={v.versionId}
          className={activeVersionId === v.versionId
            ? 'flex min-h-11 w-full items-center justify-between border-x-0 border-b border-t-0 border-os-rule-dark bg-transparent p-0 text-left font-data text-xs text-os-paper'
            : 'flex min-h-11 w-full items-center justify-between border-x-0 border-b border-t-0 border-os-rule-dark bg-transparent p-0 text-left font-data text-xs text-os-muted-dark'}
          onClick={() => onSelect(v.versionId)}
          type="button"
        >
          <span>v{v.versionNo}</span><span className="uppercase">{t(`versionStatus.${v.status}`)}</span>
        </button>
      ))}
      {limit < versions.length && <div ref={sentinelRef} className="py-3 text-center text-os-muted-dark" aria-hidden>…</div>}
    </div>
  );
}
