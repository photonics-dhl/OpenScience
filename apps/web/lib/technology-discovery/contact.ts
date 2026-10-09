import type { DiscoveryAudience, DiscoverySource } from './types';

export function consultationText(input: { audience: DiscoveryAudience; locale?: 'zh' | 'en'; name: string; organization: string; email: string; need: string; brief?: string; query?: string; sources: DiscoverySource[] }): string {
  const zh = input.locale === 'zh';
  const sources = input.sources.length ? input.sources.map((source, index) => `${index + 1}. ${source.title}${source.identifier ? ` (${source.identifier})` : ''}${source.url ? ` — ${source.url}` : ''}`).join('\n') : zh ? '未选择' : 'None selected';
  if (zh) return `OpenScience ${input.audience} 技术咨询请求\n\n姓名：${input.name}\n机构：${input.organization}\n邮箱：${input.email}\n需求：${input.need}\n工作简报：${input.brief?.trim() || '未填写'}\n最近检索：${input.query?.trim() || '未填写'}\n\n所选来源元数据：\n${sources}\n\n请与我讨论来源证据及尚待验证的问题。`;
  return `OpenScience ${input.audience} consultation request\n\nName: ${input.name}\nOrganization: ${input.organization}\nEmail: ${input.email}\nNeed: ${input.need}\nWorking brief: ${input.brief?.trim() || 'Not provided'}\nRecent query: ${input.query?.trim() || 'Not provided'}\n\nSelected source metadata:\n${sources}\n\nPlease review the source evidence and open validation questions with me.`;
}
