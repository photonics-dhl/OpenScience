import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import SiteHeader from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import readingStyles from '@/components/public/PublicReadingProduct.module.css';
import type { Locale } from '@/i18n/locale';
import styles from './developers.module.css';

const origin = 'https://openscience.428312321.xyz';
const examplePath = '/api/research/OSR-2026-000023/v/1';
const curlExample = `curl --fail-with-body --silent --show-error \\
  -H 'Accept: application/json' \\
  '${origin}${examplePath}'`;
const pythonExample = `import json
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ORIGIN = "${origin}"

def read_json(path):
    request = Request(urljoin(ORIGIN, path),
                      headers={"Accept": "application/json",
                               "User-Agent": "OpenScience-API-Example/1.0"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code != 429 or attempt == 2:
                raise
            retry = error.headers.get("Retry-After", str(2 ** attempt))
            delay = (int(retry) if retry.isdigit() else
                     (parsedate_to_datetime(retry) -
                      datetime.now(timezone.utc)).total_seconds())
            if not 0 <= delay <= 60:
                raise
            error.close()
            time.sleep(max(1, delay))

research = read_json("${examplePath}")["research"]
print(urljoin(ORIGIN, research["links"]["self"]))
for field in ("problem", "insight", "method", "results",
              "reproducibility", "limitations"):
    print(field, research["version"]["core"].get(field, ""))
for artifact in research["artifactPaths"]:
    if artifact.get("downloadUrl"):
        print(urljoin(ORIGIN, artifact["downloadUrl"]))`;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('developers');
  return { title: `${t('title')} | OpenScience`, description: t('intro'), alternates: { canonical: '/developers' } };
}

export default async function DevelopersPage() {
  const t = await getTranslations('developers');
  const shell = await getTranslations('shell');
  const locale = await getLocale() as Locale;
  const fields = ['core', 'authors', 'licenses', 'claims', 'evidence', 'artifacts', 'media', 'history', 'record', 'links'] as const;
  const paths = ['version.core', 'authors', 'licenses', 'claims', 'evidence', 'artifactPaths', 'presentationAssets', 'history', 'recordUrl', 'links'];
  return <PublicShell className={`research-product ${readingStyles.surface} ${styles.shell}`} mainClassName={styles.main} tone="paper" headerActions={<SiteHeader active="developers" context="public-product" tone="paper" />} navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')} wrapHeaderActionsOnMobile>
    <article className={styles.page}>
      <header className={`${readingStyles.identity} ${styles.header}`}>
        <div><p className="pub-kicker">OpenScience API</p><h1>{t('title')}</h1><p className={styles.intro}>{t('intro')}</p></div>
        <div className={styles.language}><LocaleSwitcher locale={locale} /></div>
      </header>
      <div className={styles.layout}>
        <nav className={styles.contents} aria-label={t('contents')}>
          {(['start', 'versions', 'fields', 'examples', 'access'] as const).map(section => <a key={section} href={`#${section}`}>{t(`${section}.title`)}</a>)}
          <a href="/api/research-record/openapi" rel="service-desc" type="application/vnd.oai.openapi+json">OpenAPI JSON ↗</a>
        </nav>
        <div className={styles.sections}>
          <section id="start" className={styles.section}>
            <header className={readingStyles.sectionIntro}><h2>{t('start.title')}</h2></header><p>{t('start.body')}</p>
            <dl className={styles.facts}><div><dt>{t('baseUrl')}</dt><dd><code>{origin}/api</code></dd></div><div><dt>{t('authentication')}</dt><dd>{t('anonymous')}</dd></div></dl>
            <div className={styles.exampleLinks}><a href={examplePath}>{t('openJson')}</a><a href="/research/OSR-2026-000023/v/1">{t('openArticle')}</a><a href="/api/research-record/openapi">{t('openSchema')}</a></div>
            <h3>curl</h3><pre tabIndex={0} aria-label={t('curlExample')}><code>{curlExample}</code></pre>
          </section>
          <section id="versions" className={styles.section}>
            <header className={readingStyles.sectionIntro}><h2>{t('versions.title')}</h2></header>
            <div className={styles.endpoint}><code>GET /research/&#123;publicId&#125;</code><p>{t('versions.latest')}</p></div>
            <div className={styles.endpoint}><code>GET /research/&#123;publicId&#125;/v/&#123;versionNo&#125;</code><p>{t('versions.fixed')}</p></div>
            <p>{t('versions.reference')}</p><p>{t('versions.relative')}</p>
            <pre tabIndex={0} aria-label={t('relativeExample')}><code>{`const self = new URL(research.links.self, "${origin}").href;`}</code></pre>
          </section>
          <section id="fields" className={styles.section}>
            <header className={readingStyles.sectionIntro}><h2>{t('fields.title')}</h2></header><p>{t('fields.body')}</p>
            <div className={styles.tableScroll}><table><thead><tr><th scope="col">{t('field')}</th><th scope="col">{t('meaning')}</th></tr></thead><tbody>
              {fields.map((field, index) => <tr key={field}><th scope="row"><code>{paths[index]}</code></th><td>{t(`fields.${field}`)}</td></tr>)}
            </tbody></table></div>
            <p className={styles.note}>{t('fields.original')}</p>
          </section>
          <section id="examples" className={styles.section}>
            <header className={readingStyles.sectionIntro}><h2>{t('examples.title')}</h2></header><p>{t('examples.body')}</p>
            <h3>{t('pythonTitle')}</h3><pre tabIndex={0} aria-label={t('pythonExample')}><code>{pythonExample}</code></pre>
            <p>{t('examples.client')}</p><p>{t('examples.retry')}</p>
          </section>
          <section id="access" className={styles.section}>
            <header className={readingStyles.sectionIntro}><h2>{t('access.title')}</h2></header>
            <dl className={styles.responses}>
              <div><dt>200</dt><dd>{t('access.ok')}</dd></div><div><dt>400</dt><dd>{t('access.invalid')}</dd></div><div><dt>403</dt><dd>{t('access.blockedClient')}</dd></div><div><dt>404</dt><dd>{t('access.missing')}</dd></div><div><dt>429</dt><dd>{t('access.limited')}</dd></div>
            </dl>
            <p>{t('access.status')}</p><p>{t('access.cookie')}</p>
          </section>
        </div>
      </div>
    </article>
  </PublicShell>;
}
