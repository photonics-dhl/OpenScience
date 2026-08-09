import { useTranslations } from 'next-intl';

export default function LatestResearch() {
  const t = useTranslations('landing');
  const items = [t('latest.item1'), t('latest.item2'), t('latest.item3')];
  const itemLabels = [t('latest.label1'), t('latest.label2'), t('latest.label3')];

  return (
    <section className="surface-evidence px-4 py-16 sm:px-6 lg:px-8 lg:py-24" data-landing-module="principles" id="principles">
      <div className="mx-auto max-w-[112rem]">
        <div className="grid gap-8 border-b border-os-rule-paper pb-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <h2 className="m-0 font-editorial text-[clamp(3.2rem,7vw,7.8rem)] font-normal leading-[0.9] tracking-[-0.065em] text-os-ink">
            {t('latest.title')}
          </h2>
          <p className="m-0 max-w-lg text-base leading-7 text-os-muted-paper lg:justify-self-end">{t('latest.empty')}</p>
        </div>
        <ol className="m-0 list-none p-0">
          {items.map((item, index) => (
            <li className="grid gap-3 border-b border-os-rule-paper py-6 sm:grid-cols-[5rem_1fr_auto] sm:items-baseline" key={item}>
              <span className="font-data text-xs text-os-muted-paper">0{index + 1}</span>
              <span className="font-editorial text-2xl tracking-[-0.025em] text-os-ink sm:text-4xl">{item}</span>
              <span className="font-data text-[10px] uppercase tracking-[0.15em] text-os-muted-paper">{itemLabels[index]}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
