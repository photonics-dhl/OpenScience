const origin = 'https://openscience.428312321.xyz';
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function journalSitemap(paths: string[], index = false) {
  const entries = [...new Set(paths)];
  if (entries.length > 50_000 || entries.some((path) => !path.startsWith('/') || path.startsWith('//'))) throw new Error('Invalid sitemap bounds');
  const tag = index ? 'sitemap' : 'url';
  const root = index ? 'sitemapindex' : 'urlset';
  const body = `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((path) => `<${tag}><loc>${escapeXml(origin + path)}</loc></${tag}>`).join('')}</${root}>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
}
