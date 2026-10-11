import type { Locale } from '@/i18n/locale';

const copy = {
  zh: {
    publishedTitle: '添加已发表论文', publishedDescription: '上传论文 PDF，记录原论文的作者、期刊和 DOI。这里先建立私有研究草稿，公开发布仍需另行确认。',
    preprintTitle: '创建预出版成果', preprintDescription: '上传 PDF，或直接填写六字段，整理并发布你的研究。创建后内容保持私有，公开发布仍需另行确认。',
    uploadPdf: '上传 PDF', uploadPdfDescription: '从论文原文开始，后续核对 Hermes 整理的内容。',
    writeDraft: '直接填写六字段', writeDraftDescription: '不需要 PDF，进入六字段编辑器。',
    title: '论文标题', authors: '原论文作者', journal: '发表期刊', doi: '原论文 DOI（可选）',
    authorsPlaceholder: '按原论文署名顺序填写', journalPlaceholder: '期刊名称', doiPlaceholder: '10.xxxx/…',
    pdfRequired: '请先选择论文 PDF。', pdfOnly: '此入口请只选择一份 PDF。', titleRequired: '请填写论文标题。',
    draftStart: '建立私有草稿', uploadStart: '上传并建立私有草稿',
  },
  en: {
    publishedTitle: 'Add a published paper', publishedDescription: 'Upload the paper PDF and record its original authors, journal, and DOI. This creates a private research draft; public release requires a separate confirmation.',
    preprintTitle: 'Create a preprint', preprintDescription: 'Start with a PDF or write directly in the six-field research draft. Your work remains private until you confirm publication.',
    uploadPdf: 'Upload a PDF', uploadPdfDescription: 'Start from the paper and review the content Hermes prepares.',
    writeDraft: 'Write the six fields', writeDraftDescription: 'No PDF needed. Open the six-field editor.',
    title: 'Paper title', authors: 'Original paper authors', journal: 'Published in', doi: 'Original paper DOI (optional)',
    authorsPlaceholder: 'List authors in the paper’s order', journalPlaceholder: 'Journal name', doiPlaceholder: '10.xxxx/…',
    pdfRequired: 'Choose a paper PDF first.', pdfOnly: 'Choose one PDF for this route.', titleRequired: 'Enter the paper title.',
    draftStart: 'Create private draft', uploadStart: 'Upload and create private draft',
  },
} as const;

export function researchCreationCopy(locale: Locale) {
  return locale === 'zh' ? copy.zh : copy.en;
}
