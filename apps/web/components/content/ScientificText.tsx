import katex from 'katex';
import type { ComponentPropsWithoutRef, ElementType } from 'react';

import styles from './ScientificText.module.css';

const MAX_TEXT_LENGTH = 50_000;
const MAX_EXPRESSION_LENGTH = 4_000;
// Public research prose is untrusted; bound both scanning and KaTeX/DOM expansion.
const MAX_DELIMITER_ATTEMPTS = 128;
const MAX_MATH_EXPRESSIONS = 64;
const MAX_TOTAL_MATH_LENGTH = 16_000;
const UNSAFE_TEX_COMMAND = /\\(?:href|url|includegraphics|htmlClass|htmlId|htmlStyle|htmlData)\b/i;

type MathPart = { type: 'text'; value: string } | { type: 'math'; source: string; value: string; display: boolean };

function isEscaped(value: string, index: number) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function findClosingDelimiter(value: string, from: number, delimiter: string, multiline: boolean) {
  const searchEnd = Math.min(value.length - delimiter.length, from + MAX_EXPRESSION_LENGTH);
  for (let cursor = from; cursor <= searchEnd; cursor += 1) {
    if (!multiline && value[cursor] === '\n') return -1;
    if (value.startsWith(delimiter, cursor) && !isEscaped(value, cursor)) return cursor;
  }
  return -1;
}

function looksLikeCurrencyPair(value: string, openingAt: number, closingAt: number) {
  const before = value[openingAt - 1];
  return (!before || /\s/.test(before) || ['(', '[', '{', '/'].includes(before))
    && /\d/.test(value[openingAt + 1] ?? '')
    && /\d/.test(value[closingAt + 1] ?? '');
}

function splitMath(value: string, maxTextLength = MAX_TEXT_LENGTH): MathPart[] {
  if (!value || value.length > maxTextLength) return [{ type: 'text', value }];

  const parts: MathPart[] = [];
  let plainStart = 0;
  let cursor = 0;
  let attempts = 0;
  let expressions = 0;
  let mathLength = 0;
  while (cursor < value.length) {
    let opening = '';
    let closing = '';
    let display = false;
    let multiline = false;

    if (value.startsWith('$$', cursor) && !isEscaped(value, cursor)) {
      opening = '$$'; closing = '$$'; display = true; multiline = true;
    } else if (value.startsWith('\\[', cursor) && !isEscaped(value, cursor)) {
      opening = '\\['; closing = '\\]'; display = true; multiline = true;
    } else if (value.startsWith('\\(', cursor) && !isEscaped(value, cursor)) {
      opening = '\\('; closing = '\\)';
    } else if (value[cursor] === '$' && !isEscaped(value, cursor)) {
      opening = '$'; closing = '$';
    }

    if (!opening) { cursor += 1; continue; }
    attempts += 1;
    if (attempts > MAX_DELIMITER_ATTEMPTS || expressions >= MAX_MATH_EXPRESSIONS) break;
    const contentStart = cursor + opening.length;
    const closingAt = findClosingDelimiter(value, contentStart, closing, multiline);
    if (closingAt < 0) { cursor += opening.length; continue; }

    // In prose, "$5 / $10" is two currency amounts rather than one formula.
    if (opening === '$' && looksLikeCurrencyPair(value, cursor, closingAt)) {
      cursor += 1;
      continue;
    }

    const expression = value.slice(contentStart, closingAt);
    if (!expression.trim() || expression.length > MAX_EXPRESSION_LENGTH || UNSAFE_TEX_COMMAND.test(expression)) {
      cursor = closingAt + closing.length;
      continue;
    }
    if (mathLength + expression.length > MAX_TOTAL_MATH_LENGTH) break;
    expressions += 1;
    mathLength += expression.length;

    if (cursor > plainStart) parts.push({ type: 'text', value: value.slice(plainStart, cursor) });
    parts.push({ type: 'math', source: value.slice(cursor, closingAt + closing.length), value: expression, display });
    cursor = closingAt + closing.length;
    plainStart = cursor;
  }
  if (plainStart < value.length) parts.push({ type: 'text', value: value.slice(plainStart) });
  return parts.length ? parts : [{ type: 'text', value }];
}

export function escapeScientificMathForMarkdown(value: string) {
  // A writing draft permits 60,000 characters; the renderer keeps its own limit.
  return splitMath(value, 60_000).map((part) => {
    if (part.type === 'text') return part.value;
    const delimiter = part.display ? '$$' : '$';
    // CommonMark consumes backslash escapes before the text reaches KaTeX.
    // Escape its ASCII punctuation so it restores the exact TeX source.
    const expression = part.value.replace(/[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/gu, '\\$&');
    return `${delimiter}${expression}${delimiter}`;
  }).join('');
}

/** Map raw boundaries using exactly the textarea's outside-math marker hiding rule. */
export function scientificDisplaySelection(value: string, start: number, end: number): { start: number; end: number } {
  const displayOffsets = [0];
  let displayOffset = 0;
  for (const part of splitMath(value)) {
    const source = part.type === 'math' ? part.source : part.value;
    for (let index = 0; index < source.length;) {
      const marker = part.type === 'text' ? source.slice(index).match(/^\[S\d{1,4}\]/u)?.[0] : undefined;
      if (marker) {
        for (let token = 0; token < marker.length; token++) displayOffsets.push(displayOffset);
        index += marker.length;
      } else { index++; displayOffset++; displayOffsets.push(displayOffset); }
    }
  }
  const at = (offset: number) => displayOffsets[Math.max(0, Math.min(value.length, offset))];
  return { start: at(start), end: at(end) };
}

/** Convert a plain field once, keeping untouched prose literal and math source intact. */
export function prepareScientificMarkdownSelection(value: string, start: number, end: number, markdown = false, displayOffsets = false): { value: string; start: number; end: number } | null {
  if (displayOffsets) {
    const rawOffsets = [0];
    let rawOffset = 0;
    for (const part of splitMath(value)) {
      const source = part.type === 'math' ? part.source : part.value;
      for (let index = 0; index < source.length;) {
        const marker = part.type === 'text' ? source.slice(index).match(/^\[S\d{1,4}\]/u)?.[0] : undefined;
        if (marker) {
          index += marker.length; rawOffset += marker.length;
          rawOffsets[rawOffsets.length - 1] = rawOffset;
        } else { index++; rawOffset++; rawOffsets.push(rawOffset); }
      }
    }
    start = rawOffsets[start]; end = rawOffsets[end];
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > value.length || start >= end) return null;
  let offset = 0;
  let output = '';
  const offsets: number[] = [];
  for (const part of splitMath(value, 60_000)) {
    const source = part.type === 'math' ? part.source : part.value;
    if (part.type === 'math' && start < offset + source.length && end > offset) return null;
    for (let index = 0; index < source.length; index++) {
      const marker = part.type === 'text' ? source.slice(index).match(/^\[S\d{1,4}\]/u)?.[0] : undefined;
      if (marker) {
        for (let token = 0; token < marker.length; token++) offsets[offset + index + token] = output.length + token;
        output += marker; index += marker.length - 1; continue;
      }
      offsets[offset + index] = output.length;
      const character = source[index];
      output += markdown || part.type === 'math' ? character
        : character === '\n' ? '  \n'
        : character === ' ' || character === '\t' ? `&#${character.charCodeAt(0)};`
        : /[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/u.test(character) ? `&#${character.charCodeAt(0)};` : character;
    }
    offset += source.length;
  }
  offsets[value.length] = output.length;
  return { value: output, start: offsets[start], end: offsets[end] };
}

function renderExpression(value: string, displayMode: boolean) {
  try {
    return katex.renderToString(value, {
      displayMode,
      output: 'htmlAndMathml',
      throwOnError: true,
      strict: 'error',
      trust: false,
      maxExpand: 200,
      maxSize: 10,
    });
  } catch {
    return null;
  }
}

export function hasExplicitMath(value: string) {
  return splitMath(value).some((part) => part.type === 'math' && renderExpression(part.value, part.display) !== null);
}

const removeSourceMarkers = (value: string) => value.replace(/\[S\d{1,4}\]/gu, '');

/** Hide Hermes source-map IDs in research prose without changing TeX or saved sources. */
export function withoutInternalSourceMarkers(value: string) {
  return splitMath(value).map((part) => part.type === 'text' ? removeSourceMarkers(part.value) : part.source).join('');
}

/** Keep source offsets while excluding formulas from prose heading/citation matching. */
export function scientificProseForMatching(value: string) {
  return splitMath(value).map(part => part.type === 'text' ? part.value : part.source.replace(/[^\n]/g, ' ')).join('');
}

/** Card excerpts may end between prose characters, but never inside a TeX token. */
export function scientificTextExcerpt(value: string, maxLength = 240) {
  const parts = splitMath(withoutInternalSourceMarkers(value));
  let excerpt = '';
  let length = 0;
  for (const part of parts) {
    const source = part.type === 'math' ? part.source : part.value;
    const characters = Array.from(source);
    const remaining = maxLength - length;
    if (remaining <= 0) return `${excerpt.trimEnd()}…`;
    if (characters.length <= remaining) { excerpt += source; length += characters.length; continue; }
    if (part.type === 'text') excerpt += characters.slice(0, remaining).join('');
    return `${excerpt.trimEnd()}…`;
  }
  return excerpt;
}

export function ScientificText<T extends ElementType = 'div'>({
  as,
  className,
  children,
  hideSourceMarkers = false,
  ...props
}: {
  as?: T;
  className?: string;
  children: string;
  hideSourceMarkers?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>) {
  const Component = as ?? 'div';
  const parts = splitMath(children);
  return (
    <Component className={[styles.text, className].filter(Boolean).join(' ')} {...props}>
      {parts.map((part, index) => {
        if (part.type === 'text') return hideSourceMarkers ? removeSourceMarkers(part.value) : part.value;
        const html = renderExpression(part.value, part.display);
        if (!html) return part.source;
        return <span className={part.display ? styles.displayMath : styles.inlineMath} dangerouslySetInnerHTML={{ __html: html }} key={index} />;
      })}
    </Component>
  );
}
