'use client';

import { useTranslations } from 'next-intl';
import type { TrashResourceKind } from './TrashActionButton';

// These exact session templates are emitted by ingestion-service. A UUID in an
// arbitrary title is not sufficient evidence that the title is machine-generated.
const ingestionSession = /^(Ingestion|Legacy ingestion refresh|Ingestion analysis refresh|Ingestion reanalysis) [0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u;

export function useContentLabels() {
  const t = useTranslations('trash');
  const title = (item: { kind: TrashResourceKind; title: string | null | undefined }) => {
    const value = item.title;
    if (!value?.trim()) return t(`kind.${item.kind}`);
    if (item.kind === 'session') {
      const ingestion = ingestionSession.exec(value);
      if (ingestion) return t(ingestion[1] === 'Ingestion' ? 'contentTitle.sourceImport' : 'contentTitle.sourceReanalysis');
      if (value === 'Hermes research video') return t('contentTitle.researchVideo');
      if (value === 'Presentation asset generation') return t('contentTitle.mediaGeneration');
      if (value === 'Hermes 会话') return t('kind.session');
    }
    if (item.kind === 'task') {
      // listCleanableContent fallbacks; writingDraft.title remains unchanged.
      if (value === '论文分析草稿' || value === 'sdf.extract') return t('contentTitle.analysisDraft');
      if (value === 'Hermes 研究内容' || value === 'workspace.guide' || value === 'presentation.generate') return t('contentTitle.researchContent');
    }
    if (item.kind === 'asset') {
      // PresentationAssetKind values, used as titles by the content/trash API.
      if (value === 'image' || value === 'svg') return t('contentTitle.image');
      if (value === 'chart') return t('contentTitle.chart');
      if (value === 'interactive_html') return t('contentTitle.interactive');
      if (value === 'video') return t('contentTitle.video');
    }
    return value;
  };
  return { title };
}
