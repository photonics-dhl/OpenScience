import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { PaperDoiAssociation } from '../app/research-objects/[id]/files/PaperDoiAssociation';
import zh from '../messages/zh.json';

describe('personal research paper DOI entry', () => {
  it('offers a scoped DOI check with privacy and authorship boundaries beside materials', () => {
    const markup = renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: 'zh', timeZone: 'Asia/Shanghai', messages: zh,
      children: createElement(PaperDoiAssociation, { object: {
        id: 'ro', workspaceId: 'ws', title: 'Private research', version: 3, status: 'draft', visibility: 'private', createdAt: '2026-10-01', originalDoi: null,
      }, onSaved: () => undefined }) }));
    expect(markup).toContain('关联原论文 DOI');
    expect(markup).toContain('核对 DOI');
    expect(markup).toContain('不会显示其他人的私有草稿');
    expect(markup).toContain('不会确认作者身份或转移素材授权');
  });
});
