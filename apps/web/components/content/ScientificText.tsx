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

export function ScientificText<T extends ElementType = 'div'>({
  as,
  className,
  children,
  ...props
}: {
  as?: T;
  className?: string;
  children: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>) {
  const Component = as ?? 'div';
  const parts = splitMath(children);
  return (
    <Component className={[styles.text, className].filter(Boolean).join(' ')} {...props}>
      {parts.map((part, index) => {
        if (part.type === 'text') return part.value;
        const html = renderExpression(part.value, part.display);
        if (!html) return part.source;
        return <span className={part.display ? styles.displayMath : styles.inlineMath} dangerouslySetInnerHTML={{ __html: html }} key={index} />;
      })}
    </Component>
  );
}
