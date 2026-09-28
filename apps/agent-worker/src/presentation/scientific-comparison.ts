export type ScientificBinding = { kind: 'symbol' | 'expression'; key: string } | { kind: 'unsupported-expression' };
type Token = { text: string; start: number; end: number; kind: 'identifier' | 'number' | 'other' };
type Expression = { key: string; symbol: boolean; next: number };
const identifier = /^[A-Za-z\u0370-\u03ff][A-Za-z\d_\u0370-\u03ff]*$/u;
const normalizeIdentifier = (value: string) => value.toLowerCase().replaceAll('_', '');

/** Syntactic binding only: no evaluation, algebraic rewriting or symbol aliases. */
export function scientificComparisonBinding(input: string, numberStart: number): {
  binding: ScientificBinding; start: number; end: number;
} | undefined {
  const offset = Math.max(0, numberStart - 160);
  const before = input.slice(offset, numberStart);
  const relation = /(?:<<|<=|>=|=|≈|~|≪|≥|≤|>|<)\s*$/u.exec(before);
  // Original sources also state a named width or ratio as "FWHM_T (19 as)"
  // or "Tc1/2 (i.e., 0.26 fs)". Ordinary prose parentheses are not symbols.
  const annotation = relation ? null : /\(\s*(?:i\.e\.,?\s*)?$/iu.exec(before);
  const separator = relation ?? annotation;
  if (!separator) return undefined;
  const lhs = before.slice(0, separator.index).trimEnd();
  const tokens: Token[] = [...lhs.matchAll(/[A-Za-z\u0370-\u03ff][A-Za-z\d_\u0370-\u03ff]*|(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?|\S/gu)]
    .map(match => ({ text: match[0], start: match.index!, end: match.index! + match[0].length,
      kind: identifier.test(match[0]) ? 'identifier' : /^(?:\d|\.\d)/u.test(match[0]) ? 'number' : 'other' }));
  if (!tokens.length) return undefined;
  // "the z-direction (~77 nm)" supplies an approximate prose quantity, not
  // an equation for everything before the parenthesis. Preserve both widths.
  if (relation && tokens.at(-1)?.text === '(' && ['~', '≈'].includes(relation[0].trim())) {
    const preceding = tokens.at(-2);
    if (offset > 0 && tokens.length <= 2)
      return { binding: { kind: 'unsupported-expression' }, start: numberStart, end: numberStart };
    if (!preceding || preceding.kind === 'identifier' && preceding.end < tokens.at(-1)!.start)
      return undefined;
  }
  const openGroups: number[] = [];
  tokens.forEach((token, index) => {
    if (token.text === '(') openGroups.push(index);
    else if (token.text === ')') openGroups.pop();
  });
  const atom = (index: number): Expression | undefined => {
    const token = tokens[index];
    if (!token) return undefined;
    if (token.text === '+' || token.text === '-') {
      const value = atom(index + 1);
      return value ? { key: `(${token.text}${value.key})`, symbol: false, next: value.next } : undefined;
    }
    if (token.text === '(') {
      const value = expression(index + 1);
      return value && tokens[value.next]?.text === ')' ? { ...value, next: value.next + 1 } : undefined;
    }
    if (token.kind === 'identifier') return { key: normalizeIdentifier(token.text), symbol: true, next: index + 1 };
    if (token.kind === 'number') return { key: token.text, symbol: false, next: index + 1 };
    return undefined;
  };
  const product = (index: number): Expression | undefined => {
    let value = atom(index);
    if (!value) return undefined;
    while (['*', '×', '·', '/'].includes(tokens[value.next]?.text ?? '')) {
      const operator: string = tokens[value.next]!.text === '/' ? '/' : '*';
      const right = atom(value.next + 1);
      if (!right) return undefined;
      value = { key: `(${value.key}${operator}${right.key})`, symbol: false, next: right.next };
    }
    return value;
  };
  const expression = (index: number): Expression | undefined => {
    let value = product(index);
    if (!value) return undefined;
    while (['+', '-'].includes(tokens[value.next]?.text ?? '')) {
      const right = product(value.next + 1);
      if (!right) return undefined;
      value = { key: `(${value.key}${tokens[value.next]!.text}${right.key})`, symbol: false, next: right.next };
    }
    return value;
  };
  const completedQuantity = (end: number) => /\d\s*(?:as|fs|ps|ns|nm|μm|mm|MeV|keV|eV)\s*$/iu.test(lhs.slice(0, end));
  const proseBoundary = /^[.,;:!?。；，、：！？“”‘’"'—–\u4e00-\u9fff]$/u;
  const mathSyntax = (token: Token | undefined) => token?.kind === 'other' && !proseBoundary.test(token.text);
  let unsupportedStart: number | undefined;
  for (let start = 0; start < tokens.length; start++) {
    const previous = tokens[start - 1];
    // Never recover a suffix after an operator, grouping delimiter, function
    // call or other mathematical syntax: that would relabel the last operand.
    const opensComparison = previous?.text === '(' && openGroups.includes(start - 1)
      && (start === 1 && offset === 0 || completedQuantity(previous.start)
        || /[;:。；，,\u4e00-\u9fff]/u.test(tokens[start - 2]?.text ?? ''));
    const afterQuantityComparison = previous && /^[<>≤≥≪]$/u.test(previous.text) && completedQuantity(previous.start);
    if (previous && (!opensComparison && !afterQuantityComparison && mathSyntax(previous)
      || previous.kind === 'number' || previous.end === tokens[start]!.start && previous.kind === 'identifier')) continue;
    // Whitespace can hide a cropped operator; a window boundary is never proof
    // of a complete expression. A group after an identifier may be a function.
    if (start === 0 && offset > 0 || tokens[start]!.text === '(' && previous?.kind === 'identifier') continue;
    const first = expression(start);
    if (!first) {
      if (tokens[start]!.kind !== 'other' || tokens[start]!.text === '(') unsupportedStart = start;
      continue;
    }
    let next = first.next;
    while (['=', '≈', '~'].includes(tokens[next]?.text ?? '')) {
      const right = expression(next + 1);
      if (!right) break;
      next = right.next;
    }
    if (next !== tokens.length) {
      if (mathSyntax(tokens[next])) unsupportedStart = start;
      continue;
    }
    if (annotation && first.symbol && !['fwhms', 'fwhmt', 'nsp'].includes(first.key)) return undefined;
    return { binding: { kind: first.symbol ? 'symbol' : 'expression', key: first.key },
      start: offset + tokens[start]!.start, end: offset + separator.index };
  }
  const tail = tokens.at(-1)!;
  if (relation && (tail.kind !== 'other' || mathSyntax(tail)))
    return { binding: { kind: 'unsupported-expression' },
      // A failed local expression may contain structural coefficients. When
      // its beginning cannot be proved, do not hide any earlier quantities.
      start: offset + (unsupportedStart === undefined ? separator.index : tokens[unsupportedStart]!.start),
      end: offset + separator.index };
  return undefined;
}
