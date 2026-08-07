import React, { useId } from 'react';

type EvolvingRoSymbolProps = {
  variant: 'sculptural' | 'interface';
  animated?: boolean;
  /** Evolution panel stages; undefined = full published state (hero). */
  stage?: 'create' | 'parse' | 'diff' | 'publish';
};

type ContentStroke = {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type FacetKey =
  | 'problem'
  | 'insight'
  | 'method'
  | 'results'
  | 'limitations'
  | 'reproducibility';

type Facet = {
  key: FacetKey;
  path: string;
  contentStrokes: ContentStroke[];
};

// Annular-wedge geometry: six 52° wedges with 8° gaps on a shared ring,
// open center hole kept clearly readable (inner radius 158 of 330).
const CX = 400;
const CY = 400;
const OUTER_RADIUS = 330;
const INNER_RADIUS = 158;
const WEDGE_SPAN_DEG = 52;

// Clockwise research cycle: upper-left -> top -> upper-right ->
// lower-right -> bottom -> lower-left.
const FACET_CENTER_ANGLES: Record<FacetKey, number> = {
  problem: 210,
  insight: 270,
  method: 330,
  results: 30,
  limitations: 90,
  reproducibility: 150,
};

function polar(radius: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function fmt(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function wedgePath(centerDeg: number): string {
  const start = centerDeg - WEDGE_SPAN_DEG / 2;
  const end = centerDeg + WEDGE_SPAN_DEG / 2;
  const [ox0, oy0] = polar(OUTER_RADIUS, start);
  const [ox1, oy1] = polar(OUTER_RADIUS, end);
  const [ix1, iy1] = polar(INNER_RADIUS, end);
  const [ix0, iy0] = polar(INNER_RADIUS, start);

  return `M${fmt(ox0)} ${fmt(oy0)} A${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${fmt(ox1)} ${fmt(oy1)} L${fmt(ix1)} ${fmt(iy1)} A${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${fmt(ix0)} ${fmt(iy0)} Z`;
}

function contentTicks(centerDeg: number): ContentStroke[] {
  const radii = [208, 240, 272];
  const halfSpan = 7;

  return radii.map((radius) => {
    const [x1, y1] = polar(radius, centerDeg - halfSpan);
    const [x2, y2] = polar(radius, centerDeg + halfSpan);

    return {
      type: 'line',
      x1: Number(fmt(x1)),
      y1: Number(fmt(y1)),
      x2: Number(fmt(x2)),
      y2: Number(fmt(y2)),
    };
  });
}

const facetKeys: FacetKey[] = [
  'problem',
  'insight',
  'method',
  'results',
  'limitations',
  'reproducibility',
];

const facets: Facet[] = facetKeys.map((key) => ({
  key,
  path: wedgePath(FACET_CENTER_ANGLES[key]),
  contentStrokes: contentTicks(FACET_CENTER_ANGLES[key]),
}));

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
  opacity: number,
) {
  const facetTransform =
    variant === 'sculptural'
      ? 'translate(400 400) scale(1.04) translate(-400 -400)'
      : undefined;

  return (
    <g
      key={facet.key}
      data-facet={facet.key}
      transform={facetTransform}
      style={{ opacity, transition: 'opacity 600ms ease' }}
    >
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
        opacity="0.55"
      />
      <path
        data-outline-layer="outer-bloom"
        d={facet.path}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="16"
        strokeLinejoin="round"
        filter={`url(#${ids.outerBloom})`}
        opacity="0.22"
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
  stage,
}: EvolvingRoSymbolProps) {
  const idPrefix = useId().replace(/:/g, '');
  const motionEnabled = animated && !prefersReducedMotion();
  const heroSurfaceId = `${idPrefix}-hero-surface`;
  const innerGlowId = `${idPrefix}-inner-glow`;
  const outerBloomId = `${idPrefix}-outer-bloom`;

  const ringOpacity =
    stage === 'create' ? 0.35 : stage === 'parse' || stage === 'diff' ? 0.75 : 1;
  const showTrajectoryMain = stage !== 'create';
  const showBranch = stage === undefined || stage === 'diff' || stage === 'publish';
  const showDiffNode = stage === undefined || stage === 'diff';

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
          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.18" />
          <stop offset="55%" stopColor="var(--hero-surface)" />
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
          renderFacet(
            facet,
            variant,
            {
              heroSurface: heroSurfaceId,
              innerGlow: innerGlowId,
              outerBloom: outerBloomId,
            },
            stage === 'create' && facet.key === 'problem' ? 1 : ringOpacity,
          ),
        )}
        <g
          fill="none"
          stroke="var(--accent-primary)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          style={{
            opacity: showTrajectoryMain ? 1 : 0,
            transition: 'opacity 600ms ease',
          }}
        >
          <path
            data-trajectory="main"
            d="M40 402 C200 386 300 384 380 394 C440 401 520 408 760 396"
          />
          {showBranch ? (
            <>
              <path
                data-trajectory="branch"
                d="M470 405 C490 472 506 542 522 611"
              />
              <path
                data-trajectory="merge"
                d="M522 611 C546 542 560 474 566 406"
              />
              <circle
                data-trajectory-junction="branch"
                cx="470"
                cy="405"
                fill="var(--accent-primary)"
                r="4"
              />
              <circle
                data-trajectory-junction="merge"
                cx="566"
                cy="406"
                fill="var(--accent-primary)"
                r="4"
              />
            </>
          ) : null}
        </g>
        {showDiffNode ? (
          <g data-diff-node="branch">
            <circle
              cx="522"
              cy="611"
              fill="var(--accent-diff)"
              r="10"
              stroke="var(--hero-bg)"
              strokeWidth="4"
            />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
