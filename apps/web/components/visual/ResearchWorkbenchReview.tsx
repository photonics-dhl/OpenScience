'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleDot,
  FileText,
  Focus,
  Library,
  Menu as MenuIcon,
  MessageSquareText,
  Search,
  Sparkle,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { HermesActionId } from '@/lib/hermes/action-catalog';
import {
  createResearchWorkbenchState,
  parseResearchWorkbenchView,
  reduceResearchWorkbenchState,
  RESEARCH_WORKBENCH_VIEWS,
  type ResearchWorkbenchView,
} from '@/lib/research-workbench-state';

import styles from './research-workbench-review.module.css';

const ResearchWorkbenchHermes = dynamic(
  () => import('./ResearchWorkbenchHermes').then((module) => module.ResearchWorkbenchHermes),
  { ssr: false },
);

type SceneCopy = {
  eyebrow: string;
  label: string;
  note: string;
};

const VIEW_ICONS = {
  dashboard: CircleDot,
  editor: FileText,
  explore: Search,
  mobile: MenuIcon,
  reading: BookOpen,
  review: Focus,
} as const;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

export function ResearchWorkbenchReview() {
  const t = useTranslations('researchWorkbenchReview');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(
    reduceResearchWorkbenchState,
    parseResearchWorkbenchView(searchParams.get('view')),
    createResearchWorkbenchState,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<HermesActionId>('ear-perk');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const isMobileScene = state.view === 'mobile';

  const scenes = useMemo(
    () => RESEARCH_WORKBENCH_VIEWS.map((view) => ({
      eyebrow: t(`views.${view}.eyebrow`),
      label: t(`views.${view}.label`),
      note: t(`views.${view}.note`),
      view,
    })) as Array<SceneCopy & { view: ResearchWorkbenchView }>,
    [t],
  );

  const currentScene = scenes.find((scene) => scene.view === state.view) ?? scenes[0];
  const liveStatus = state.reviewAccepted
    ? t('status.recorded')
    : state.speech === 'quiet'
      ? t('status.quiet')
      : t('status.ready');

  function dispatchContextMenu() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    trigger.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      clientX: isMobileScene ? 18 : Math.max(18, bounds.left - 354),
      clientY: isMobileScene ? Math.max(12, bounds.top - 360) : bounds.top + 22,
    }));
    setMenuOpen(true);
  }

  useEffect(() => {
    if (state.view !== 'dashboard') return;
    const frame = requestAnimationFrame(dispatchContextMenu);
    return () => cancelAnimationFrame(frame);
  }, [state.view]);

  useEffect(() => () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
  }, []);

  function selectView(view: ResearchWorkbenchView) {
    setMenuOpen(false);
    dispatch({ type: 'view', view });
    router.replace(`/_visual/research-workbench?view=${view}`, { scroll: false });
  }

  function handleSceneTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    view: ResearchWorkbenchView,
  ) {
    const index = RESEARCH_WORKBENCH_VIEWS.indexOf(view);
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % RESEARCH_WORKBENCH_VIEWS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + RESEARCH_WORKBENCH_VIEWS.length) % RESEARCH_WORKBENCH_VIEWS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = RESEARCH_WORKBENCH_VIEWS.length - 1;
    else return;
    event.preventDefault();
    const nextView = RESEARCH_WORKBENCH_VIEWS[nextIndex];
    selectView(nextView);
    requestAnimationFrame(() => document.getElementById(`scene-tab-${nextView}`)?.focus());
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'touch') return;
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      suppressClickTimerRef.current = setTimeout(() => {
        suppressClickRef.current = false;
      }, 800);
      dispatchContextMenu();
    }, 520);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = longPressStartRef.current;
    if (!start || event.pointerType !== 'touch') return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clearLongPress();
  }

  function handleContextMenuCapture(event: React.MouseEvent<HTMLButtonElement>) {
    if (!event.nativeEvent.isTrusted) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    requestAnimationFrame(dispatchContextMenu);
  }

  function handleHermesKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const menuKey = event.key === 'ContextMenu' || event.key === 'Apps';
    if ((!event.shiftKey || event.key !== 'F10') && !menuKey) return;
    event.preventDefault();
    event.stopPropagation();
    dispatchContextMenu();
  }

  function clearLongPress() {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = null;
    longPressStartRef.current = null;
  }

  function handleHermesClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
      return;
    }
    dispatch({ open: true, type: 'assistant' });
  }

  function quietTogether() {
    setAction('read');
    dispatch({ type: 'quiet' });
  }

  return (
    <main
      className={styles.root}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      data-research-workbench-review="true"
    >
      <header className={styles.topbar}>
        <a className={styles.wordmark} href="/" aria-label={t('backHome')}>
          <span className={styles.wordmarkMark}>OS</span>
          <span>OpenScience</span>
        </a>
        <div className={styles.reviewBadge}>
          <span aria-hidden="true" />
          {t('visualReview')}
        </div>
        <a className={styles.exitLink} href="/dashboard">
          {t('exit')} <ArrowUpRight aria-hidden="true" size={16} />
        </a>
      </header>

      <section className={styles.intro} aria-labelledby="research-workbench-title">
        <div>
          <p className={styles.kicker}>{t('kicker')}</p>
          <h1 id="research-workbench-title">{t('title')}</h1>
          <p>{t('introduction')}</p>
        </div>
        <dl className={styles.measurements}>
          <div><dt>{t('measure.surface')}</dt><dd>{t('measure.surfaceValue')}</dd></div>
          <div><dt>{t('measure.reading')}</dt><dd>19 / 1.72</dd></div>
          <div><dt>Hermes</dt><dd>360 / 200</dd></div>
        </dl>
      </section>

      <nav className={styles.sceneTabs} aria-label={t('sceneLabel')} role="tablist">
        {scenes.map((scene) => {
          const Icon = VIEW_ICONS[scene.view];
          return (
            <button
              aria-controls="research-workbench-scene"
              aria-selected={scene.view === state.view}
              className={styles.sceneTab}
              id={`scene-tab-${scene.view}`}
              key={scene.view}
              onClick={() => selectView(scene.view)}
              onKeyDown={(event) => handleSceneTabKeyDown(event, scene.view)}
              role="tab"
              tabIndex={scene.view === state.view ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.7} />
              <span>{scene.label}</span>
            </button>
          );
        })}
      </nav>

      <section
        aria-labelledby={`scene-tab-${state.view}`}
        className={styles.canvas}
        id="research-workbench-scene"
        role="tabpanel"
      >
        <header className={styles.canvasHeader}>
          <div>
            <p>{currentScene.eyebrow}</p>
            <h2 id="scene-title">{currentScene.label}</h2>
          </div>
          <p>{currentScene.note}</p>
        </header>

        <div className={styles.sceneFrame} data-scene={state.view}>
          <Scene
            view={state.view}
            accepted={state.reviewAccepted}
            onAccept={() => {
              setAction('success');
              dispatch({ type: 'accept-review' });
            }}
            t={t}
          />

          <aside className={isMobileScene ? styles.hermesMobileRail : styles.hermesRail}>
            {state.speech === 'quiet' ? (
              <div className={styles.hermesFeedback} data-review-hermes-feedback="true">
                <span>{t('bubble.intent')}</span>
                <p>{t('status.quiet')}</p>
              </div>
            ) : (
              <span aria-hidden="true" className={styles.feedbackMeasure} data-review-hermes-feedback="true" />
            )}

            <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <ContextMenuTrigger asChild>
                <button
                  aria-label={t('hermesTrigger')}
                  className={styles.hermesTrigger}
                  data-review-hermes-trigger="true"
                  onClick={handleHermesClick}
                  onContextMenuCapture={handleContextMenuCapture}
                  onKeyDown={handleHermesKeyDown}
                  onPointerCancel={clearLongPress}
                  onPointerDown={handlePointerDown}
                  onPointerLeave={clearLongPress}
                  onPointerMove={handlePointerMove}
                  onPointerUp={clearLongPress}
                  ref={triggerRef}
                  type="button"
                >
                  <ResearchWorkbenchHermes
                    action={action}
                    reducedMotion={reducedMotion}
                    size={isMobileScene ? 200 : 360}
                    state={state.reviewAccepted ? 'suggesting' : state.speech === 'quiet' ? 'guiding' : 'idle'}
                  />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent
                alignOffset={isMobileScene ? 8 : -24}
                aria-label={t('menu.title')}
                className={styles.contextMenu}
                data-compact={isMobileScene ? 'true' : 'false'}
              >
                <ContextMenuLabel className={styles.menuLabel}>
                  <span>{t('menu.eyebrow')}</span>
                  <strong>{t('menu.title')}</strong>
                </ContextMenuLabel>
                <ContextMenuGroup>
                  <ContextMenuItem className={styles.menuItem} onSelect={quietTogether}>
                    <BookOpen aria-hidden="true" size={18} />
                    <span><strong>{t('menu.quiet')}</strong><small>{t('menu.quietNote')}</small></span>
                    <ContextMenuShortcut className={styles.menuShortcut}>{locale === 'zh' ? '陪伴' : 'COMPANION'}</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem className={styles.menuItem} onSelect={() => { setAction('cap-check'); dispatch({ type: 'quiet' }); }}>
                    <Sparkle aria-hidden="true" size={18} />
                    <span><strong>{t('menu.tidy')}</strong><small>{t('menu.tidyNote')}</small></span>
                  </ContextMenuItem>
                </ContextMenuGroup>
                <ContextMenuSeparator className={styles.menuRule} />
                <ContextMenuGroup>
                  <ContextMenuItem className={styles.menuItem} onSelect={() => selectView('editor')}>
                    <FileText aria-hidden="true" size={18} />
                    <span><strong>{t('menu.editor')}</strong><small>{t('menu.editorNote')}</small></span>
                    <ChevronRight aria-hidden="true" className={styles.chevron} size={17} />
                  </ContextMenuItem>
                  <ContextMenuItem className={styles.menuItem} onSelect={() => selectView('review')}>
                    <Focus aria-hidden="true" size={18} />
                    <span><strong>{t('menu.review')}</strong><small>{t('menu.reviewNote')}</small></span>
                    <ChevronRight aria-hidden="true" className={styles.chevron} size={17} />
                  </ContextMenuItem>
                </ContextMenuGroup>
                <p className={styles.menuHint}>{t(isMobileScene ? 'menu.mobileHint' : 'menu.keyboardHint')}</p>
              </ContextMenuContent>
            </ContextMenu>
          </aside>
        </div>
      </section>

      <p className={styles.liveStatus} aria-live="polite">{liveStatus}</p>

      <Dialog.Root open={state.assistantOpen} onOpenChange={(open) => dispatch({ open, type: 'assistant' })}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialog} aria-describedby="hermes-assistant-description">
            <div className={styles.dialogRule} />
            <Dialog.Title>Hermes · {t('assistant.title')}</Dialog.Title>
            <Dialog.Description id="hermes-assistant-description">
              {t('assistant.description')}
            </Dialog.Description>
            <div className={styles.assistantThread}>
              <MessageSquareText aria-hidden="true" size={19} />
              <p>{t('assistant.prompt')}</p>
            </div>
            <label className={styles.assistantInput}>
              <span>{t('assistant.inputLabel')}</span>
              <textarea defaultValue={t('assistant.draft')} rows={4} />
            </label>
            <Dialog.Close className={styles.dialogClose} aria-label={t('close')}>
              <X aria-hidden="true" size={19} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function Scene({
  accepted,
  onAccept,
  t,
  view,
}: {
  accepted: boolean;
  onAccept: () => void;
  t: ReturnType<typeof useTranslations>;
  view: ResearchWorkbenchView;
}) {
  if (view === 'dashboard') return <DashboardScene t={t} />;
  if (view === 'editor') return <EditorScene t={t} />;
  if (view === 'review') return <ReviewScene accepted={accepted} onAccept={onAccept} t={t} />;
  if (view === 'explore') return <ExploreScene t={t} />;
  if (view === 'reading') return <ReadingScene t={t} />;
  return <MobileScene t={t} />;
}

function DashboardScene({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className={styles.dashboardScene}>
      <section className={styles.primaryWork}>
        <p className={styles.sectionLabel}>{t('dashboard.active')}</p>
        <h3>{t('dashboard.title')}</h3>
        <p className={styles.readingLead} data-reading-copy="true">{t('dashboard.summary')}</p>
        <div className={styles.progressRule}><span style={{ width: '68%' }} /></div>
        <dl className={styles.studyFacts}>
          <div><dt>{t('dashboard.evidence')}</dt><dd>12 / 14</dd></div>
          <div><dt>{t('dashboard.version')}</dt><dd>v0.4</dd></div>
          <div><dt>{t('dashboard.next')}</dt><dd>{t('dashboard.nextValue')}</dd></div>
        </dl>
        <button className={styles.primaryAction} type="button">{t('dashboard.continue')} <ChevronRight aria-hidden="true" size={18} /></button>
      </section>
      <section className={styles.activity}>
        <p className={styles.sectionLabel}>{t('dashboard.activity')}</p>
        <ol>
          <li><span>10:42</span><p><strong>{t('dashboard.eventOne')}</strong>{t('dashboard.eventOneNote')}</p></li>
          <li><span>09:18</span><p><strong>{t('dashboard.eventTwo')}</strong>{t('dashboard.eventTwoNote')}</p></li>
          <li><span>{t('dashboard.yesterday')}</span><p><strong>{t('dashboard.eventThree')}</strong>{t('dashboard.eventThreeNote')}</p></li>
        </ol>
      </section>
    </div>
  );
}

function EditorScene({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className={styles.editorScene}>
      <aside className={styles.outline}>
        <p className={styles.sectionLabel}>{t('editor.outline')}</p>
        <ol>
          <li>{t('editor.problem')}</li><li className={styles.current}>{t('editor.method')}</li>
          <li>{t('editor.results')}</li><li>{t('editor.limitations')}</li>
        </ol>
      </aside>
      <article className={styles.editorPaper}>
        <p className={styles.sectionLabel}>SDF · 02</p>
        <h3>{t('editor.method')}</h3>
        <p data-reading-copy="true">{t('editor.paragraphOne')}</p>
        <p data-reading-copy="true">{t('editor.paragraphTwo')}</p>
        <blockquote>{t('editor.note')}</blockquote>
      </article>
      <aside className={styles.marginNotes}>
        <p className={styles.sectionLabel}>{t('editor.notes')}</p>
        <p><span>01</span>{t('editor.noteOne')}</p>
        <p><span>02</span>{t('editor.noteTwo')}</p>
      </aside>
    </div>
  );
}

function ReviewScene({ accepted, onAccept, t }: { accepted: boolean; onAccept: () => void; t: ReturnType<typeof useTranslations> }) {
  return (
    <div className={styles.reviewScene}>
      <aside className={styles.evidenceRail} data-evidence-rail="true">
        <p className={styles.sectionLabel}>{t('review.source')}</p>
        <span className={styles.sourceId}>FIG. 3C · RUN 07</span>
        <blockquote>{t('review.quote')}</blockquote>
        <dl><div><dt>{t('review.confidence')}</dt><dd>0.91</dd></div><div><dt>{t('review.provenance')}</dt><dd>SHA · 4b8e…92f1</dd></div></dl>
      </aside>
      <article className={styles.reviewPaper}>
        <p className={styles.sectionLabel}>{t('review.suggestion')}</p>
        <h3>{t('review.title')}</h3>
        <p data-reading-copy="true">{t('review.body')}</p>
        <div className={styles.diffLine}><span>−</span><del>{t('review.before')}</del></div>
        <div className={styles.diffLine}><span>+</span><ins>{t('review.after')}</ins></div>
        <button className={styles.primaryAction} disabled={accepted} onClick={onAccept} type="button">
          <Check aria-hidden="true" size={18} /> {accepted ? t('review.accepted') : t('review.accept')}
        </button>
      </article>
    </div>
  );
}

function ExploreScene({ t }: { t: ReturnType<typeof useTranslations> }) {
  const rows = ['one', 'two', 'three'] as const;
  return (
    <div className={styles.exploreScene}>
      <div className={styles.searchLine}><Search aria-hidden="true" size={19} /><span>{t('explore.query')}</span><kbd>⌘ K</kbd></div>
      <p className={styles.sectionLabel}>{t('explore.results')}</p>
      <ol>{rows.map((row, index) => <li key={row}><span>0{index + 1}</span><div><h3>{t(`explore.${row}Title`)}</h3><p>{t(`explore.${row}Note`)}</p></div><Library aria-hidden="true" size={18} /></li>)}</ol>
    </div>
  );
}

function ReadingScene({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <article className={styles.readingScene}>
      <p className={styles.sectionLabel}>{t('reading.citation')}</p>
      <h3>{t('reading.title')}</h3>
      <p className={styles.readingDeck}>{t('reading.deck')}</p>
      <div className={styles.byline}>{t('reading.byline')}<span>OSR-2026-0241 · v4</span></div>
      <p data-reading-copy="true">{t('reading.paragraphOne')}</p>
      <p data-reading-copy="true">{t('reading.paragraphTwo')}</p>
    </article>
  );
}

function MobileScene({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className={styles.mobileScene}>
      <div className={styles.phoneTop}><span>OpenScience</span><MenuIcon aria-hidden="true" size={19} /></div>
      <p className={styles.sectionLabel}>{t('mobile.active')}</p>
      <h3>{t('mobile.title')}</h3>
      <p data-reading-copy="true">{t('mobile.summary')}</p>
      <div className={styles.mobileProgress}><span /></div>
      <p className={styles.longPressHint}>{t('mobile.hint')}</p>
    </div>
  );
}
