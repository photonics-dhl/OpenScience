'use client';

import {
  BookOpen,
  Brain,
  Ear,
  FileCheck2,
  GitCompareArrows,
  Library,
  Moon,
  MoveDiagonal2,
  PartyPopper,
  Route,
  Sparkles,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { HermesPetMeshInput } from '@/lib/hermes/pet-mesh-renderer';
import type { HermesActionId } from '@/lib/hermes/action-catalog';
import {
  HERMES_CONTEXT_ACTIONS,
  resolveHermesResearchHref,
  type HermesContextAction,
  type HermesContextActionIcon,
  type HermesMenuFeedback,
} from '@/lib/hermes/context-menu-actions';
import type { HermesRuntimeStatus } from '@/lib/hermes/hermes-runtime-status';

import { HermesRiggedPortrait } from './HermesRiggedPortrait';
import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function HermesStaticPortrait({ state }: { state: HermesVisualState }) {
  const nodes = [
    [180, 76], [264, 128], [264, 226], [180, 278], [96, 226], [96, 128],
  ];

  return (
    <svg aria-hidden="true" className="hermes-portrait h-full w-full" viewBox="0 0 360 360">
      <defs>
        <linearGradient id="hermes-scan" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset=".5" stopColor="currentColor" stopOpacity=".85" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hermes-iris">
          <stop offset="0" stopColor="#ff4e22" stopOpacity=".95" />
          <stop offset=".28" stopColor="#ff4e22" stopOpacity=".18" />
          <stop offset="1" stopColor="#f1eee7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="hermes-orbit">
        <circle cx="180" cy="177" r="116" fill="none" stroke="currentColor" strokeDasharray="1 12" strokeOpacity=".2" />
        <path d="M70 177c42-29 72-43 110-43s68 14 110 43c-42 29-72 43-110 43s-68-14-110-43Z" fill="none" stroke="currentColor" strokeOpacity=".22" />
      </g>
      <g className="hermes-nodes">
        {nodes.map(([cx, cy], index) => <circle cx={cx} cy={cy} fill={index === 0 ? '#ff4e22' : 'currentColor'} key={`${cx}-${cy}`} opacity={index === 0 ? 1 : .5} r={index === 0 ? 3 : 2} />)}
      </g>
      <g className="hermes-gaze" data-hermes-gaze="true">
        <path d="M119 177c18-31 37-47 61-47s43 16 61 47c-18 31-37 47-61 47s-43-16-61-47Z" fill="#070a0d" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="180" cy="177" fill="url(#hermes-iris)" r="43" />
        <circle className="hermes-pupil" cx="180" cy="177" fill="currentColor" r="9" />
        <path d="M151 177h58M180 148v58" stroke="currentColor" strokeOpacity=".24" strokeWidth=".8" />
      </g>
      <path className="hermes-wave" d="M48 177h53m158 0h53" fill="none" stroke="currentColor" strokeDasharray="2 7" strokeOpacity=".36" />
      <path className="hermes-scan" d="M50 106h260" stroke="url(#hermes-scan)" strokeWidth="2" data-hermes-scan={state === 'scanning' ? 'active' : 'still'} />
    </svg>
  );
}

export interface HermesVisualAdapterProps {
  action?: HermesActionId;
  actionStartedAtMs?: number;
  assistantOpen?: boolean;
  compactPresentation?: boolean;
  state: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  onInvoke: () => void;
  onMenuAction?: (feedback: HermesMenuFeedback) => void;
  menuFeedback?: HermesMenuFeedback | null;
  onRuntimeStatus?: (status: HermesRuntimeStatus) => void;
  promptSuppressed?: boolean;
  reducedMotion: boolean;
  rendererGeneration?: number;
}

const HERMES_ACTION_ICONS: Record<HermesContextActionIcon, LucideIcon> = {
  book: BookOpen,
  celebrate: PartyPopper,
  compare: GitCompareArrows,
  evidence: FileCheck2,
  listen: Ear,
  rest: Moon,
  route: Route,
  sources: Library,
  spark: Sparkles,
  stretch: MoveDiagonal2,
  sunrise: Sunrise,
  thought: Brain,
};

export function HermesVisualAdapter({ action, actionStartedAtMs, assistantOpen = false, compactPresentation = false, state, suggestion, onInvoke, onMenuAction, menuFeedback = null, onRuntimeStatus, promptSuppressed = false, reducedMotion, rendererGeneration }: HermesVisualAdapterProps) {
  const t = useTranslations('dashboard.hermes');
  const locale = useLocale();
  const router = useRouter();
  const linkRef = useRef<HTMLButtonElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const engagedRef = useRef(false);
  const meshInputRef = useRef<HermesPetMeshInput>({ engaged: false, pointer: { x: 0, y: 0 }, state });
  const [interactiveReady, setInteractiveReady] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [compactMenu, setCompactMenu] = useState(false);
  const [compactGroup, setCompactGroup] = useState<'companion' | 'research'>('companion');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuLayoutActorTopRef = useRef<number | null>(null);
  const promptPlayedRef = useRef(false);
  const still = state === 'awaiting_approval';
  const presence = still ? 'still' : state === 'scanning' ? 'working' : assistantOpen ? 'open' : engaged ? 'attentive' : 'idle';
  meshInputRef.current.action = action;
  meshInputRef.current.actionStartedAtMs = actionStartedAtMs;

  const updateEngaged = (value: boolean) => {
    if (engagedRef.current === value) return;
    engagedRef.current = value;
    setEngaged(value);
  };

  const resetArticulation = () => {
    meshInputRef.current = { ...meshInputRef.current, engaged: false, pointer: { x: 0, y: 0 }, state };
    linkRef.current?.style.setProperty('--hermes-pointer-x', '0px');
    linkRef.current?.style.setProperty('--hermes-pointer-y', '0px');
  };

  const engageArticulation = (pointer = { x: .28, y: -.18 }) => {
    if (still || !interactiveReady) return;
    updateEngaged(true);
    meshInputRef.current = { ...meshInputRef.current, engaged: true, pointer, state };
    linkRef.current?.style.setProperty('--hermes-pointer-x', `${pointer.x * 14}px`);
    linkRef.current?.style.setProperty('--hermes-pointer-y', `${pointer.y * 10}px`);
  };

  const clearLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = null;
    longPressStartRef.current = null;
  };

  const getActorBounds = () => {
    const trigger = linkRef.current;
    return trigger?.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')?.getBoundingClientRect()
      ?? trigger?.getBoundingClientRect()
      ?? null;
  };

  const updateMenuOpen = (open: boolean) => {
    const trigger = linkRef.current;
    menuLayoutActorTopRef.current = compactMenu && trigger?.closest('[data-hermes-placement="anchored"]')
      ? getActorBounds()?.top ?? null
      : null;
    setMenuOpen(open);
    if (open) setCompactGroup('companion');
  };

  useClientLayoutEffect(() => {
    const actorTopBeforeLayout = menuLayoutActorTopRef.current;
    menuLayoutActorTopRef.current = null;
    const trigger = linkRef.current;
    if (actorTopBeforeLayout === null || !compactMenu || !trigger?.closest('[data-hermes-placement="anchored"]')) return;
    const actorTopAfterLayout = getActorBounds()?.top;
    if (actorTopAfterLayout === undefined) return;
    // The compact tool band joins the document flow; counter-scroll keeps Hermes
    // visually stationary while the protected research surface moves clear.
    const layoutShift = actorTopAfterLayout - actorTopBeforeLayout;
    if (Math.abs(layoutShift) > 1) window.scrollBy({ behavior: 'auto', top: layoutShift });
  }, [compactMenu, menuOpen]);

  const dispatchContextMenu = () => {
    const trigger = linkRef.current;
    if (!trigger) return;
    const estimatedMenuHeight = compactMenu ? 366 : 380;
    if (trigger.closest('[data-hermes-placement="anchored"]')) {
      const initialBounds = getActorBounds() ?? trigger.getBoundingClientRect();
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const requiredActorTop = viewportTop + estimatedMenuHeight + 40;
      const availableScroll = window.scrollY;
      const scrollDelta = Math.max(-availableScroll, initialBounds.top - requiredActorTop);
      if (scrollDelta < -1) window.scrollBy({ behavior: 'auto', top: scrollDelta });
    }
    const bounds = getActorBounds() ?? trigger.getBoundingClientRect();
    const menuWidth = compactMenu ? 304 : 360;
    const menuX = Math.max(menuWidth / 2 + 8, Math.min(window.innerWidth - menuWidth / 2 - 8, bounds.left + bounds.width / 2));
    const menuY = bounds.top - 32 - estimatedMenuHeight;
    trigger.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      clientX: menuX,
      clientY: menuY,
    }));
    updateMenuOpen(true);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch') return;
    event.currentTarget.removeAttribute('data-hermes-long-press-active');
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressRef.current = setTimeout(() => {
      linkRef.current?.setAttribute('data-hermes-long-press-active', 'true');
      suppressClickRef.current = true;
      suppressClickTimerRef.current = setTimeout(() => { suppressClickRef.current = false; }, 800);
      dispatchContextMenu();
    }, 520);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = longPressStartRef.current;
    if (event.pointerType === 'touch' && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clearLongPress();
  };

  const chooseAction = (item: HermesContextAction) => {
    updateMenuOpen(false);
    onMenuAction?.({ action: item.action, messageKey: item.feedbackKey });
    if (item.group !== 'research') return;
    const href = resolveHermesResearchHref(item.key as 'continue' | 'evidence' | 'sources' | 'compare', {
      href: suggestion.href,
      researchObjectId: suggestion.researchObjectId,
    });
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    navigationTimerRef.current = window.setTimeout(() => {
      navigationTimerRef.current = null;
      router.push(href);
    }, 900);
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const sync = () => setCompactMenu(compactPresentation || media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [compactPresentation]);

  useEffect(() => () => {
    clearLongPress();
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
  }, []);

  useEffect(() => {
    if (assistantOpen) engageArticulation({ x: .42, y: -.12 });
  }, [assistantOpen, interactiveReady, still, state]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      if (still || reducedMotion) {
        setInteractiveReady(false);
        updateEngaged(false);
        resetArticulation();
        return;
      }
      timer = window.setTimeout(() => {
        if (!cancelled) setInteractiveReady(true);
      }, 0);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('load', schedule);
    };
  }, [reducedMotion, still]);

  useEffect(() => {
    if (still || assistantOpen || promptSuppressed) {
      setPromptVisible(false);
      return;
    }
    if (reducedMotion) {
      setPromptVisible(true);
      return;
    }
    if (promptPlayedRef.current) {
      setPromptVisible(false);
      return;
    }
    let revealTimer = 0;
    let hideTimer = 0;
    const schedule = () => {
      window.clearTimeout(revealTimer);
      if (document.hidden || promptPlayedRef.current) return;
      revealTimer = window.setTimeout(() => {
        promptPlayedRef.current = true;
        setPromptVisible(true);
        hideTimer = window.setTimeout(() => setPromptVisible(false), 7600);
      }, 1800);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(revealTimer);
        window.clearTimeout(hideTimer);
        setPromptVisible(false);
      } else schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(hideTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [assistantOpen, promptSuppressed, reducedMotion, still]);

  const setGaze = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (still || !interactiveReady) return;
    updateEngaged(true);
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    meshInputRef.current = { ...meshInputRef.current, engaged: true, pointer: { x, y }, state };
    linkRef.current?.style.setProperty('--hermes-pointer-x', `${x * 14}px`);
    linkRef.current?.style.setProperty('--hermes-pointer-y', `${y * 10}px`);
  };

  const resetGaze = () => {
    if (assistantOpen) {
      engageArticulation({ x: .42, y: -.12 });
      return;
    }
    updateEngaged(false);
    resetArticulation();
  };

  return <>
    <ContextMenu open={menuOpen} onOpenChange={updateMenuOpen}>
      <ContextMenuTrigger asChild>
        <button
          aria-label={t('guide.menu.trigger')}
          className="hermes-visual group relative block min-h-72 w-full overflow-hidden border-b border-os-rule-dark text-left text-os-paper outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion"
          onBlur={resetGaze}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
              suppressClickTimerRef.current = null;
              return;
            }
            onInvoke();
          }}
          onContextMenuCapture={(event) => {
            if (!event.nativeEvent.isTrusted) return;
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            requestAnimationFrame(dispatchContextMenu);
          }}
          onFocus={() => engageArticulation()}
          onKeyDown={(event) => {
            const menuKey = event.key === 'ContextMenu' || event.key === 'Apps';
            if ((!event.shiftKey || event.key !== 'F10') && !menuKey) return;
            event.preventDefault();
            event.stopPropagation();
            dispatchContextMenu();
          }}
          onPointerCancel={() => { clearLongPress(); resetGaze(); }}
          onPointerDown={handlePointerDown}
          onPointerEnter={() => engageArticulation()}
          onPointerLeave={() => { clearLongPress(); resetGaze(); }}
          onPointerMove={(event) => { handlePointerMove(event); setGaze(event); }}
          onPointerUp={(event) => {
            clearLongPress();
            const target = event.currentTarget;
            window.setTimeout(() => target.removeAttribute('data-hermes-long-press-active'), 0);
          }}
          ref={linkRef}
          type="button"
          data-hermes-fallback="static"
          data-hermes-renderer="articulated-mesh"
          data-hermes-state={state}
          data-hermes-engaged={engaged ? 'true' : 'false'}
          data-hermes-presence={presence}
          data-motion={still ? 'still' : 'responsive'}
          data-hermes-input-ready={interactiveReady ? 'true' : 'false'}
          data-hermes-input-owner="true"
          data-hermes-menu-open={menuOpen ? 'true' : 'false'}
        >
          <span data-reading-role="caption" className="hermes-visual-state-label absolute left-0 top-0 z-10 font-mono uppercase tracking-[0.1em] text-os-muted-dark">Hermes / {state.replaceAll('_', ' ')}</span>
          <span className="hermes-visual-invoke-label absolute inset-x-0 bottom-3 z-10 flex items-center justify-between gap-4 border-t border-os-rule-dark pt-3 text-xs text-os-muted-dark" data-hermes-visual-footer="true">
            <span className="truncate">{t(suggestion.titleKey)}</span><span className="hermes-visible-invoke-cta shrink-0 text-os-vermilion transition-transform group-hover:translate-x-1 motion-reduce:transform-none" data-hermes-visible-invoke-cta="true">{t('guide.invoke')} →</span>
          </span>
          <span
            className="hermes-companion-actor absolute inset-x-2 bottom-9 top-9 flex justify-center text-os-paper"
            data-hermes-companion-actor="true"
            data-hermes-instance="single"
          >
            <HermesRiggedPortrait
              fallback={<HermesStaticPortrait state={state} />}
              inputRef={meshInputRef}
              onRuntimeStatus={onRuntimeStatus}
              reducedMotion={reducedMotion}
              rendererGeneration={rendererGeneration}
              state={state}
            />
            <span aria-hidden="true" className="hermes-speech-mouth-anchor" data-hermes-mouth-anchor="true" />
          </span>
          <span aria-hidden={!promptVisible} className="hermes-guide-nudge" data-visible={promptVisible ? 'true' : 'false'}>{t(suggestion.bodyKey)}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={t('guide.menu.label')}
        className="hermes-context-menu"
        data-compact={compactMenu ? 'true' : 'false'}
        data-hermes-action-menu="true"
        data-hermes-menu-layout="carried-sheet"
        data-hermes-reduced-motion={reducedMotion ? 'true' : 'false'}
        data-locale={locale}
        loop
      >
        <ContextMenuLabel className="hermes-context-menu-label">
          <span>{t('guide.menu.eyebrow')}</span>
          <strong>{t('guide.menu.title')}</strong>
        </ContextMenuLabel>
        <ContextMenuGroup className="hermes-context-menu-switch" data-hermes-mobile-group-switch="true">
          {(['companion', 'research'] as const).map((group) => (
            <ContextMenuItem
              className="hermes-context-menu-switch-item"
              data-active={compactGroup === group ? 'true' : 'false'}
              key={group}
              onSelect={(event) => {
                event.preventDefault();
                setCompactGroup(group);
              }}
            >
              {t(`guide.menu.groups.${group}`)}
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
        {(['companion', 'research'] as const).map((group) => (
          <React.Fragment key={group}>
            {group === 'research' ? <ContextMenuSeparator className="hermes-context-menu-rule" /> : null}
            <ContextMenuLabel
              className="hermes-context-menu-group-label"
              data-hermes-group-label={group}
              hidden={compactMenu && compactGroup !== group}
            >
              {t(`guide.menu.groups.${group}`)}
            </ContextMenuLabel>
            <ContextMenuGroup
              className={`hermes-context-menu-group hermes-context-menu-${group}`}
              data-hermes-action-group={group}
              hidden={compactMenu && compactGroup !== group}
            >
              {HERMES_CONTEXT_ACTIONS.filter((item) => item.group === group).map((item, index) => {
                const Icon = HERMES_ACTION_ICONS[item.icon];
                return (
                  <ContextMenuItem
                    className="hermes-context-menu-item"
                    data-hermes-action-id={item.action}
                    data-hermes-action-key={item.key}
                    data-hermes-action-position={index + 1}
                    key={item.key}
                    onSelect={() => chooseAction(item)}
                  >
                    <span className="hermes-context-menu-icon"><Icon aria-hidden="true" size={17} /></span>
                    <strong>{t(item.labelKey)}</strong>
                  </ContextMenuItem>
                );
              })}
            </ContextMenuGroup>
          </React.Fragment>
        ))}
        <p className="hermes-context-menu-hint">{t(compactMenu ? 'guide.menu.mobileHint' : 'guide.menu.keyboardHint')}</p>
      </ContextMenuContent>
    </ContextMenu>
    {menuFeedback && !menuOpen ? <p
      aria-live="polite"
      className="hermes-menu-feedback"
      data-hermes-bubble-material="warm-paper"
      data-hermes-feedback-action={menuFeedback.action}
      data-hermes-menu-feedback="true"
      data-hermes-speech-copy="single"
      data-hermes-speech-origin="mouth"
    >
      {t(menuFeedback.messageKey)}
    </p> : null}
  </>;
}
