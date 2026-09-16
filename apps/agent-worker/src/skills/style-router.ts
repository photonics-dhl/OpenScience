/**
 * Style router — when the user does not pin a style, pick one from the
 * instruction keywords + paper context. This is a deterministic rule list,
 * not an LLM call, so it is cheap and reproducible. The Hermes guide and
 * the workspace guide can use it as a fallback; the user can always
 * override the choice by passing an explicit `style`.
 *
 * The routing table is biased toward the science-publishing defaults: an
 * instruction with no clear signal falls back to `scientific` (v6
 * technical), never to a decorative style.
 */
export type PaperContext = {
  paperTitle?: string;
  documentType?: 'paper-body' | 'review' | 'thesis' | 'deck' | 'poster' | 'tutorial' | 'other';
  /** Output target hint: cover or in-figure. */
  output?: 'cover' | 'in-figure' | 'process' | 'comparison' | 'flow';
};

const ROUTING_TABLE: Array<{ test: RegExp; style: string; reason: string }> = [
  // Cover / magazine / editorial
  { test: /封面|杂志|cover|magazine|editorial/i, style: 'editorial', reason: 'cover/magazine cue' },
  // Hand-drawn / storybook / tutorial
  { test: /手绘|简笔|storybook|sketch\s*-?\s*notes|sketchnoting|教程|tutorial|hand-?drawn/i, style: 'hand-drawn-edu', reason: 'hand-drawn/tutorial cue' },
  // Subway / schematic / process
  { test: /地铁|流程|schematic|工程|装置|蓝图|blueprint|isometric|setup|apparatus|schematic/i, style: 'technical-schematic', reason: 'schematic/blueprint cue' },
  // Watercolor
  { test: /水彩|watercolor|水墨|淡彩/i, style: 'watercolor', reason: 'watercolor cue' },
  // Black-and-white ink
  { test: /黑白|线稿|ink-?notes|whitepaper|sketchnote/i, style: 'ink-notes', reason: 'ink/whitepaper cue' },
  // Knolling / flat-lay
  { test: /平铺|knolling|flat-?lay|flatlay/i, style: 'knolling', reason: 'knolling/flatlay cue' },
  // Bold graphic / dashboard
  { test: /信息图|信息圖|信息|dashboard|infographic|视觉|海报|poster|story-?mountain/i, style: 'bold-graphic', reason: 'infographic/dashboard cue' },
  // Subway-map-like for processes
  { test: /subway-?map|metro-?map|线路|线网/i, style: 'subway-map', reason: 'subway-map cue' },
  // Pixel / retro (rare; only when user explicitly asks)
  { test: /像素|pixel|retro/i, style: 'pixel-art', reason: 'pixel/retro cue' },
  // Editorial / vintage (very soft)
  { test: /vintage|retro-?pop|aged/i, style: 'vintage', reason: 'vintage cue' },
];

const DOCUMENT_TYPE_DEFAULT: Record<NonNullable<PaperContext['documentType']>, string> = {
  'paper-body': 'scientific',
  'review': 'ink-notes',
  'thesis': 'scientific',
  'deck': 'bold-graphic',
  'poster': 'bold-graphic',
  'tutorial': 'hand-drawn-edu',
  'other': 'scientific',
};

const OUTPUT_DEFAULT: Record<NonNullable<PaperContext['output']>, string> = {
  cover: 'editorial',
  'in-figure': 'scientific',
  process: 'subway-map',
  comparison: 'bento-grid', // not a style — should map to a layout, kept for future use
  flow: 'linear-progression',
};

export interface RouteStyleResult {
  style: string;
  reason: string;
}

/**
 * Pick a style id from the instruction + paper context. Returns `scientific`
 * when nothing matches; the caller may pass an explicit `userStyle` to
 * override the result.
 */
export function routeStyle(instruction: string, context?: PaperContext, userStyle?: string): RouteStyleResult {
  if (userStyle) return { style: userStyle, reason: 'user override' };
  const combined = `${instruction ?? ''}\n${context?.paperTitle ?? ''}`.trim();
  for (const rule of ROUTING_TABLE) {
    if (rule.test.test(combined)) return { style: rule.style, reason: rule.reason };
  }
  if (context?.documentType) {
    const style = DOCUMENT_TYPE_DEFAULT[context.documentType];
    if (style) return { style, reason: `document type ${context.documentType}` };
  }
  if (context?.output) {
    const style = OUTPUT_DEFAULT[context.output];
    if (style) return { style, reason: `output ${context.output}` };
  }
  return { style: 'scientific', reason: 'default' };
}
