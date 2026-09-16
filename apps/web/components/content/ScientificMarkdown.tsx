import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Children, type ReactNode } from 'react';
import { escapeScientificMathForMarkdown, ScientificText } from './ScientificText';

function normalizeMathOutsideCode(markdown: string) {
  let fence = '';
  let prose = '';
  let output = '';
  const flushProse = () => {
    output += escapeScientificMathForMarkdown(prose);
    prose = '';
  };
  markdown.split('\n').forEach((line, lineIndex) => {
    if (lineIndex) {
      if (fence) output += '\n';
      else prose += '\n';
    }
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      flushProse();
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = '';
      output += line;
      return;
    }
    if (fence) {
      output += line;
      return;
    }
    let inlineFence = '';
    for (let index = 0; index < line.length;) {
      if (line[index] === '`') {
        flushProse();
        let end = index + 1;
        while (line[end] === '`') end += 1;
        const marker = line.slice(index, end);
        if (!inlineFence) inlineFence = marker;
        else if (inlineFence === marker) inlineFence = '';
        output += marker;
        index = end;
        continue;
      }
      if (inlineFence) output += line[index];
      else prose += line[index];
      index += 1;
    }
  });
  flushProse();
  return output;
}

function ScientificChildren({ children, budget, hideSourceMarkers }: { children: ReactNode; hideSourceMarkers: boolean; budget: { expressions: number; text: number } }) {
  return Children.map(children, (child, index) => {
    if (typeof child === 'string') {
      const expressions = Math.floor((child.match(/\$/gu)?.length ?? 0) / 2);
      if (expressions && (budget.expressions + expressions > 64 || budget.text + child.length > 16_000)) return child;
      budget.expressions += expressions;
      if (expressions) budget.text += child.length;
      return <ScientificText as="span" key={index} hideSourceMarkers={hideSourceMarkers}>{child}</ScientificText>;
    }
    return child;
  });
}

function safeMarkdownUrl(url: string) {
  const value = url.trim();
  return value.startsWith('#') || /^(?:https?:|mailto:)/iu.test(value) ? value : '';
}

export function ScientificMarkdown({ body, hideSourceMarkers = false }: { body: string; hideSourceMarkers?: boolean }) {
  const mathBudget = { expressions: 0, text: 0 };
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    skipHtml
    urlTransform={safeMarkdownUrl}
    components={{
      img: () => null,
      a: ({ href, children }) => href && safeMarkdownUrl(href) ? <a href={href} rel="noreferrer noopener" target="_blank"><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></a> : <span><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></span>,
      p: ({ children }) => <p><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></p>,
      h1: ({ children }) => <h1><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></h1>,
      h2: ({ children }) => <h2><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></h2>,
      h3: ({ children }) => <h3><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></h3>,
      h4: ({ children }) => <h4><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></h4>,
      li: ({ children }) => <li><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></li>,
      blockquote: ({ children }) => <blockquote><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></blockquote>,
      strong: ({ children }) => <strong><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></strong>,
      em: ({ children }) => <em><ScientificChildren budget={mathBudget} hideSourceMarkers={hideSourceMarkers}>{children}</ScientificChildren></em>,
    }}
  >{normalizeMathOutsideCode(body)}</ReactMarkdown>;
}

