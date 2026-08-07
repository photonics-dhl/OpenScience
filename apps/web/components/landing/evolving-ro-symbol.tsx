import React, { useId } from 'react';

type EvolvingRoSymbolProps = {
  variant: 'sculptural' | 'interface';
  animated?: boolean;
};

type ContentStroke =
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number };

type Facet = {
  key:
    | 'problem'
    | 'insight'
    | 'method'
    | 'results'
    | 'limitations'
    | 'reproducibility';
  path: string;
  contentStrokes: ContentStroke[];
};

const facets: Facet[] = [
  {
    key: 'problem',
    path: 'M104 255 L255 112 L345 175 L292 292 L170 330 Z',
    contentStrokes: [
      { type: 'rect', x: 158, y: 207, width: 86, height: 34 },
      { type: 'line', x1: 170, y1: 263, x2: 263, y2: 226 },
      { type: 'line', x1: 185, y1: 285, x2: 250, y2: 259 },
    ],
  },
  {
    key: 'insight',
    path: 'M302 93 L458 93 L502 182 L400 242 L298 182 Z',
    contentStrokes: [
      { type: 'rect', x: 339, y: 126, width: 122, height: 24 },
      { type: 'line', x1: 329, y1: 172, x2: 420, y2: 172 },
      { type: 'line', x1: 350, y1: 197, x2: 452, y2: 197 },
    ],
  },
  {
    key: 'method',
    path: 'M545 112 L696 255 L630 330 L508 292 L455 175 Z',
    contentStrokes: [
      { type: 'rect', x: 548, y: 191, width: 88, height: 34 },
      { type: 'line', x1: 520, y1: 248, x2: 610, y2: 278 },
      { type: 'line', x1: 548, y1: 271, x2: 621, y2: 297 },
    ],
  },
  {
    key: 'results',
    path: 'M696 545 L545 688 L455 625 L508 508 L630 470 Z',
    contentStrokes: [
      { type: 'rect', x: 548, y: 548, width: 88, height: 34 },
      { type: 'line', x1: 533, y1: 608, x2: 621, y2: 537 },
      { type: 'line', x1: 559, y1: 634, x2: 613, y2: 591 },
    ],
  },
  {
    key: 'limitations',
    path: 'M458 707 L302 707 L298 618 L400 558 L502 618 Z',
    contentStrokes: [
      { type: 'rect', x: 338, y: 623, width: 124, height: 24 },
      { type: 'line', x1: 329, y1: 671, x2: 421, y2: 671 },
      { type: 'line', x1: 350, y1: 690, x2: 453, y2: 690 },
    ],
  },
  {
    key: 'reproducibility',
    path: 'M104 545 L170 470 L292 508 L345 625 L255 688 Z',
    contentStrokes: [
      { type: 'rect', x: 163, y: 548, width: 88, height: 34 },
      { type: 'line', x1: 188, y1: 608, x2: 278, y2: 536 },
      { type: 'line', x1: 180, y1: 632, x2: 253, y2: 589 },
    ],
  },
];

const filterRegion = {
  x: '-35%',
  y: '-35%',
  width: '170%',
  height: '170%',
};

function prefersReducedMotion() {
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function renderContentStroke(
  stroke: ContentStroke,
  facetKey: Facet['key'],
  index: number,
) {
  if (stroke.type === 'rect') {
    return (
      <rect
        key={`${facetKey}-stroke-${index}`}
        data-content-stroke={`${facetKey}-${index}`}
        x={stroke.x}
        y={stroke.y}
        width={stroke.width}
        height={stroke.height}
        rx="3"
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="2"
        opacity="0.58"
      />
    );
  }

  return (
    <line
      key={`${facetKey}-stroke-${index}`}
      data-content-stroke={`${facetKey}-${index}`}
      x1={stroke.x1}
      y1={stroke.y1}
      x2={stroke.x2}
      y2={stroke.y2}
      stroke="var(--accent-primary)"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.58"
    />
  );
}

function renderFacet(
  facet: Facet,
  variant: EvolvingRoSymbolProps['variant'],
  ids: {
    heroSurface: string;
    innerGlow: string;
    outerBloom: string;
  },
) {
  const facetTransform =
    variant === 'sculptural'
      ? 'translate(400 400) scale(1.04) translate(-400 -400)'
      : undefined;

  return (
    <g key={facet.key} data-facet={facet.key} transform={facetTransform}>
      <g
        data-history-scale="1.12"
        transform="translate(400 400) scale(1.12) translate(-400 -400)"
        opacity="0.07"
      >
        <path
          d={facet.path}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="1.5"
        />
      </g>
      <g
        data-history-scale="1.06"
        transform="translate(400 400) scale(1.06) translate(-400 -400)"
        opacity="0.15"
      >
        <path
          d={facet.path}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="1.5"
        />
      </g>
      <path
        data-outline-layer="core"
        d={facet.path}
        fill={`url(#${ids.heroSurface})`}
        stroke="var(--accent-primary-strong)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        data-outline-layer="inner-glow"
        d={facet.path}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="6"
        strokeLinejoin="round"
        filter={`url(#${ids.innerGlow})`}
        opacity="0.78"
      />
      <path
        data-outline-layer="outer-bloom"
        d={facet.path}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="16"
        strokeLinejoin="round"
        filter={`url(#${ids.outerBloom})`}
        opacity="0.38"
      />
      {variant === 'interface'
        ? facet.contentStrokes.map((stroke, index) =>
            renderContentStroke(stroke, facet.key, index),
          )
        : null}
    </g>
  );
}

export default function EvolvingRoSymbol({
  variant,
  animated = true,
}: EvolvingRoSymbolProps) {
  const idPrefix = useId().replace(/:/g, '');
  const motionEnabled = animated && !prefersReducedMotion();
  const heroSurfaceId = `${idPrefix}-hero-surface`;
  const innerGlowId = `${idPrefix}-inner-glow`;
  const outerBloomId = `${idPrefix}-outer-bloom`;

  return (
    <svg
      aria-hidden="true"
      className="evolving-ro-symbol"
      focusable="false"
      height="100%"
      role="presentation"
      viewBox="0 0 800 800"
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
      pointerEvents="none"
    >
      {motionEnabled ? (
        <style>{`
          .evolving-ro-symbol__breathing {
            animation: evolving-ro-symbol-breathe 10s ease-in-out infinite alternate;
            transform-box: fill-box;
            transform-origin: center;
          }
          @keyframes evolving-ro-symbol-breathe {
            from { opacity: 0.96; transform: scale(1); }
            to { opacity: 1; transform: scale(1.015); }
          }
          @media (prefers-reduced-motion: reduce) {
            .evolving-ro-symbol__breathing { animation: none; }
          }
        `}</style>
      ) : null}
      <defs>
        <linearGradient id={heroSurfaceId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--hero-surface)" />
          <stop offset="100%" stopColor="var(--hero-bg)" />
        </linearGradient>
        <filter id={innerGlowId} {...filterRegion}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={outerBloomId} {...filterRegion}>
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <g className={motionEnabled ? 'evolving-ro-symbol__breathing' : undefined}>
        {facets.map((facet) =>
          renderFacet(facet, variant, {
            heroSurface: heroSurfaceId,
            innerGlow: innerGlowId,
            outerBloom: outerBloomId,
          }),
        )}
        <g
          fill="none"
          stroke="var(--accent-primary)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        >
          <path
            data-trajectory="main"
            d="M64 400 C210 360 285 365 360 390 C405 407 420 410 440 410 C545 412 610 432 736 400"
          />
          <path
            data-trajectory="branch"
            d="M360 390 C420 320 472 270 525 225"
          />
          <path
            data-trajectory="merge"
            d="M525 225 C562 275 548 350 440 410"
          />
          <circle
            data-trajectory-junction="branch"
            cx="360"
            cy="390"
            fill="var(--accent-primary)"
            r="4"
          />
          <circle
            data-trajectory-junction="merge"
            cx="440"
            cy="410"
            fill="var(--accent-primary)"
            r="4"
          />
        </g>
        <g data-diff-node="branch">
          <circle
            cx="360"
            cy="390"
            fill="var(--accent-diff)"
            r="10"
            stroke="var(--hero-bg)"
            strokeWidth="4"
          />
        </g>
      </g>
    </svg>
  );
}
