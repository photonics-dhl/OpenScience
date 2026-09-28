export type ScientificRepresentation = { kind: 'symbol' | 'expression' | 'quantity-name'; key: string };
export type ScientificBinding = (ScientificRepresentation & { equivalents?: ScientificRepresentation[] }) | { kind: 'unsupported-expression' };
type Token = { text: string; start: number; end: number; kind: 'identifier' | 'number' | 'other'; horizontalSpaceBefore: boolean };
type Expression = { key: string; symbol: boolean; numeric: boolean; symbolic: boolean; next: number; implicitProduct?: boolean; ambiguousDivision?: boolean };
const identifier = /^[A-Za-z\u0370-\u03ff][A-Za-z\d_\u0370-\u03ff]*$/u;
const normalizeIdentifier = (value: string) => value.toLowerCase().replaceAll('_', '');
const proseBoundary = /^[.,;:!?。；，、：！？“”‘’"'—–\u4e00-\u9fff]$/u;
const mathSyntax = (token: Token | undefined) => token?.kind === 'other' && !proseBoundary.test(token.text);
function tokenize(value: string): Token[] {
  return [...value.matchAll(/[A-Za-z\u0370-\u03ff][A-Za-z\d_\u0370-\u03ff]*|(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?|\S/gu)]
    .map((match, index, matches) => ({ text: match[0], start: match.index!, end: match.index! + match[0].length,
      horizontalSpaceBefore: index > 0 && /^[ \t]+$/u.test(value.slice(matches[index - 1]!.index! + matches[index - 1]![0].length, match.index!)),
      kind: identifier.test(match[0]) ? 'identifier' : /^(?:\d|\.\d)/u.test(match[0]) ? 'number' : 'other' }));
}
function mathParser(tokens: Token[]) {
  const atom = (index: number): Expression | undefined => {
    const token = tokens[index];
    if (!token) return undefined;
    if (token.text === '+' || token.text === '-') {
      const value = atom(index + 1);
      return value ? { ...value, key: `(${token.text}${value.key})`, symbol: false } : undefined;
    }
    if (token.text === '(') {
      const value = expression(index + 1);
      return value && tokens[value.next]?.text === ')' ? { ...value, implicitProduct: false, next: value.next + 1 } : undefined;
    }
    if (token.kind === 'identifier') {
      // A finite notation rule, not general implicit multiplication: one Greek
      // coefficient, a standard trig name and one Greek argument. Keep every
      // factor/argument in the key; never join arbitrary prose or cross lines.
      let term = '';
      for (let end = index; end < Math.min(tokens.length, index + 3); end++) {
        const part = tokens[end]!;
        if (part.kind !== 'identifier' || end > index && !part.horizontalSpaceBefore) break;
        term += part.text;
        const trig = /^([\u0370-\u03ff])?(sin|cos|tan)([\u0370-\u03ff])$/u.exec(term);
        if (trig) {
          const call = `${trig[2]}(${normalizeIdentifier(trig[3]!)})`;
          return { key: trig[1] ? `(${normalizeIdentifier(trig[1])}*${call})` : call,
            symbol: false, numeric: false, symbolic: true, next: end + 1, implicitProduct: !!trig[1] };
        }
      }
      return { key: normalizeIdentifier(token.text), symbol: true, numeric: false, symbolic: true, next: index + 1 };
    }
    if (token.kind === 'number') return { key: token.text, symbol: false, numeric: true, symbolic: false, next: index + 1 };
    return undefined;
  };
  const combine = (left: Expression, operator: string, right: Expression): Expression => ({
    key: `(${left.key}${operator}${right.key})`, symbol: false,
    numeric: left.numeric || right.numeric, symbolic: left.symbolic || right.symbolic, next: right.next,
    // Division cannot choose a precedence for an ungrouped implicit product.
    // Explicit parentheses clear implicitProduct; nested ambiguity stays fatal.
    ambiguousDivision: left.ambiguousDivision || right.ambiguousDivision || operator === '/' && right.implicitProduct,
  });
  const product = (index: number): Expression | undefined => {
    let value = atom(index);
    if (!value) return undefined;
    while (['*', '×', '·', '/'].includes(tokens[value.next]?.text ?? '')) {
      const operator: string = tokens[value.next]!.text === '/' ? '/' : '*';
      const right = atom(value.next + 1);
      if (!right) return undefined;
      value = combine(value, operator, right);
    }
    return value;
  };
  const expression = (index: number): Expression | undefined => {
    let value = product(index);
    if (!value) return undefined;
    while (['+', '-'].includes(tokens[value.next]?.text ?? '')) {
      const operator: string = tokens[value.next]!.text;
      const right = product(value.next + 1);
      if (!right) return undefined;
      value = combine(value, operator, right);
    }
    return value;
  };
  return expression;
}
const representation = (value: Expression): ScientificRepresentation => ({ kind: value.symbol ? 'symbol' : 'expression', key: value.key });

/** Explicit local prose only; no translation, synonyms or inferred variable aliases. */
function proseQuantity(before: string, offset: number) {
  const unsupported = () => ({ binding: { kind: 'unsupported-expression' as const }, start: offset + before.length, end: offset + before.length });
  const namedSymbol = /\(([A-Za-z\u0370-\u03ff][A-Za-z\d_\u0370-\u03ff]*)\)\s+(?:is|of)\s*$/iu.exec(before);
  if (namedSymbol) {
    const prefix = before.slice(0, namedSymbol.index), name = /\b([A-Za-z][A-Za-z-]{2,})\s+$/u.exec(prefix);
    if (prefix && (!name || !/\s$/u.test(prefix))) return unsupported();
    return { binding: { kind: 'symbol' as const, key: normalizeIdentifier(namedSymbol[1]!) }, start: offset + namedSymbol.index, end: offset + before.length };
  }
  const predicate = /\b([A-Za-z]+(?:-[A-Za-z]+)*(?:[ \t]+[A-Za-z]+(?:-[A-Za-z]+)*){0,7})[ \t]+(?:of|is)[ \t]*$/iu.exec(before);
  const annotation = /\b([A-Za-z]+(?:-[A-Za-z]+)*(?:[ \t]+[A-Za-z]+(?:-[A-Za-z]+)*){1,7})[ \t]+\(\s*(?:≈|~)?\s*$/u.exec(before);
  const prose = predicate ?? annotation ?? /\b([A-Za-z]+(?:-[A-Za-z]+)*(?:[ \t]+[A-Za-z]+(?:-[A-Za-z]+)*){1,7})[ \t]*(?:=|≈|~)[ \t]*$/u.exec(before);
  if (!prose) return undefined;
  if (!predicate && (prose[1]!.split(/\s+/u).at(-1)!.length === 1 || /[A-Z]/u.test(prose[1]!.split(/\s+/u).at(-1)!))) return undefined;
  const preceding = before.slice(0, prose.index).trimEnd().at(-1);
  const words = prose[1]!.toLowerCase().split(/\s+/u);
  // Grammatical delimiters identify a local noun phrase; they never map words
  // to a scientific symbol. Direction/object modifiers remain part of the key.
  const lastDelimiter = words.reduce((last, word, index) => /^(?:with|has|have|assuming|assume|and|is|although)$/u.test(word) ? index : last, -1);
  const prefixTokens = preceding === '(' ? tokenize(before.slice(0, prose.index)) : [];
  const proseGroup = preceding === '(' && groupBoundary(prefixTokens, prefixTokens.length - 1);
  // A cropped noun phrase supplies no exact name. Preserve the existing
  // unbound prose value instead of asserting that this is invalid math.
  if (annotation && lastDelimiter < 0 && (prose.index === 0 && offset > 0 || preceding && /[A-Za-z]/u.test(preceding))) return undefined;
  if (prose.index === 0 && offset > 0 && lastDelimiter < 0
    || preceding && !proseBoundary.test(preceding) && !proseGroup
      && !(preceding === ')' && lastDelimiter >= 0)
      && (!/[A-Za-z\d]/u.test(preceding) || lastDelimiter < 0)) return unsupported();
  // Articles and hyphenation do not change the named quantity. In particular,
  // an internal "the" must not discard the head or its direction modifier.
  const name = words.slice(lastDelimiter + 1).filter((word, index) => word !== 'the' && !(index === 0 && /^(?:a|an)$/u.test(word)))
    .map(word => word.split('-').map((part, index, parts) =>
      `${index === 0 ? '' : part.length > 1 || parts[index - 1]!.length > 1 ? ' ' : '-'}${part}`).join('')).join(' ');
  if (!name) return undefined;
  return { binding: { kind: 'quantity-name' as const, key: name }, prose: !!predicate || !!annotation,
    start: offset + prose.index, end: offset + before.length };
}

// A complete group can be a prose parenthesis, but not a function argument or
// the interior of an unsupported mathematical expression.
function groupBoundary(tokens: Token[], index: number): boolean {
  const previous = tokens[index - 1];
  if (!previous || proseBoundary.test(previous.text)) return true;
  if (previous.kind !== 'identifier' || previous.end === tokens[index]!.start) return false;
  if (/^(?:is|of|and|as)$/iu.test(previous.text)) return true;
  if (previous.text.length < 3) return false;
  const earlier = tokens[index - 2];
  return !!earlier && earlier.kind === 'identifier' && earlier.end < previous.start;
}
function referenceBoundary(tokens: Token[], index: number): boolean {
  const previous = tokens[index - 1];
  if (tokens[index]!.text === '(' && !groupBoundary(tokens, index)) return false;
  if (previous?.text === '(') return groupBoundary(tokens, index - 1);
  return !mathSyntax(previous) || ['=', '≈', '~', '<', '>', '≤', '≥', '≪'].includes(previous!.text);
}

/** Only explicit local equality edges; no value-based or cross-passage inference. */
export function scientificEqualityRelations(input: string): Array<[ScientificRepresentation, ScientificRepresentation]> {
  const tokens = tokenize(input), relations: Array<[ScientificRepresentation, ScientificRepresentation]> = [];
  for (let index = 0; index < tokens.length; index++) {
    if (!referenceBoundary(tokens, index)) continue;
    const local = tokens.slice(index, index + 80), parse = mathParser(local), left = parse(0);
    if (!left?.symbolic || left.ambiguousDivision || local[left.next]?.text !== '=') continue;
    const right = parse(left.next + 1);
    if (!right?.symbolic || right.ambiguousDivision || local[right.next - 1]!.end - local[0]!.start > 160) continue;
    const next = tokens[index + right.next];
    if (next && (next.kind !== 'other' || mathSyntax(next) && ![')', '=', '≈', '~', '<', '>', '≤', '≥', '≪'].includes(next.text))) continue;
    relations.push([representation(left), representation(right)]);
  }
  return relations;
}

/** Syntactic binding only: no evaluation, algebraic rewriting or inferred aliases. */
export function scientificComparisonBinding(input: string, numberStart: number): {
  binding: ScientificBinding; start: number; end: number; prose?: boolean;
} | undefined {
  const offset = Math.max(0, numberStart - 160);
  const before = input.slice(offset, numberStart);
  const prose = proseQuantity(before, offset);
  if (prose) return prose;
  const relation = /(?:<<|<=|>=|=|≈|~|≪|≥|≤|>|<)\s*$/u.exec(before);
  const annotation = relation ? null : /\(\s*(?:i\.e\.,?\s*)?$/iu.exec(before);
  const separator = relation ?? annotation;
  if (!separator) return undefined;
  const lhs = before.slice(0, separator.index).trimEnd();
  const tokens = tokenize(lhs);
  if (!tokens.length) return undefined;
  if (relation && tokens.at(-1)?.text === '(' && ['~', '≈'].includes(relation[0].trim())) {
    const preceding = tokens.at(-2);
    if (offset > 0 && tokens.length <= 2)
      return { binding: { kind: 'unsupported-expression' }, start: numberStart, end: numberStart };
    if (!preceding || preceding.kind === 'identifier' && preceding.end < tokens.at(-1)!.start) return undefined;
  }
  const openGroups: number[] = [];
  tokens.forEach((token, index) => {
    if (token.text === '(') openGroups.push(index);
    else if (token.text === ')') openGroups.pop();
  });
  const expression = mathParser(tokens);
  const completedQuantity = (end: number) => /\d\s*(?:as|fs|ps|ns|nm|μm|mm|MeV|keV|eV)\s*$/iu.test(lhs.slice(0, end));
  let unsupportedStart: number | undefined;
  for (let start = 0; start < tokens.length; start++) {
    const previous = tokens[start - 1];
    const opensComparison = previous?.text === '(' && openGroups.includes(start - 1)
      && (start === 1 && offset === 0 || completedQuantity(previous.start)
        || /[;:。；，,\u4e00-\u9fff]/u.test(tokens[start - 2]?.text ?? ''));
    const afterQuantityComparison = previous && /^[<>≤≥≪]$/u.test(previous.text) && completedQuantity(previous.start);
    const narrativeArrow = previous?.text === '→' && /[\u4e00-\u9fff]/u.test(lhs.slice(0, previous.start))
      && !openGroups.some(index => index < start);
    if (previous && (!opensComparison && !afterQuantityComparison && !narrativeArrow && mathSyntax(previous)
      || previous.kind === 'number' || previous.end === tokens[start]!.start && previous.kind === 'identifier')) continue;
    if (start === 0 && offset > 0 || tokens[start]!.text === '(' && previous?.kind === 'identifier') continue;
    const first = expression(start);
    if (!first) {
      if (tokens[start]!.kind !== 'other' || tokens[start]!.text === '(') unsupportedStart = start;
      continue;
    }
    const equivalents: ScientificRepresentation[] = [];
    let ambiguousDivision = first.ambiguousDivision;
    let next = first.next, exactChain = true;
    while (['=', '≈', '~'].includes(tokens[next]?.text ?? '')) {
      exactChain &&= tokens[next]!.text === '=';
      const right = expression(next + 1);
      if (!right) break;
      ambiguousDivision ||= right.ambiguousDivision;
      if (exactChain) equivalents.push(representation(right));
      next = right.next;
    }
    if (ambiguousDivision) return { binding: { kind: 'unsupported-expression' }, start: offset + tokens[start]!.start, end: offset + separator.index };
    if (next !== tokens.length) {
      if (mathSyntax(tokens[next])) unsupportedStart = start;
      continue;
    }
    if (annotation && first.symbol && !['fwhms', 'fwhmt', 'nsp'].includes(first.key)) return undefined;
    return { binding: { ...representation(first), ...(equivalents.length ? { equivalents } : {}) },
      start: offset + tokens[start]!.start, end: offset + separator.index };
  }
  const tail = tokens.at(-1)!;
  if (relation && (tail.kind !== 'other' || mathSyntax(tail)))
    return { binding: { kind: 'unsupported-expression' },
      start: offset + (unsupportedStart === undefined ? separator.index : tokens[unsupportedStart]!.start), end: offset + separator.index };
  return undefined;
}

/** Whole symbolic references with constants (e.g. λ0/2), never bare constants. */
export function scientificExpressionReferences(input: string): Array<{ key: string; start: number; end: number; unsupported?: boolean }> {
  const tokens = tokenize(input), result: Array<{ key: string; start: number; end: number; unsupported?: boolean }> = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (tokens[index - 1]?.kind === 'number') continue;
    if (!referenceBoundary(tokens, index)) continue;
    const local = tokens.slice(index, index + 80);
    const value = mathParser(local)(0);
    if (value?.ambiguousDivision) {
      const end = Math.min(local[value.next - 1]!.end, token.start + 160);
      result.push({ key: input.slice(token.start, end), start: token.start, end, unsupported: true });
      index += value.next - 1;
      continue;
    }
    // A failed numerical math group must not be rescanned from its interior:
    // that would turn (1-β f(θ)) into the valid but unrelated prefix (1-β).
    if (!value && token.text === '(') {
      const inner = mathParser(local)(1);
      const startsNumericMath = local[1]?.kind === 'number' && ['+', '-', '*', '×', '·', '/'].includes(local[2]?.text ?? '');
      if (inner?.numeric && inner.symbolic || startsNumericMath) {
        let endIndex = index, depth = 1;
        while (endIndex + 1 < tokens.length && endIndex - index + 1 < 80
          && tokens[endIndex + 1]!.end - token.start <= 160 && !proseBoundary.test(tokens[endIndex + 1]!.text)) {
          endIndex++;
          if (tokens[endIndex]!.text === '(') depth++;
          if (tokens[endIndex]!.text === ')' && --depth === 0) break;
        }
        result.push({ key: input.slice(token.start, tokens[endIndex]!.end), start: token.start, end: tokens[endIndex]!.end, unsupported: true });
        index = endIndex;
        continue;
      }
    }
    // An unparsed function/operator must not degrade to its internal bare
    // constant and accidentally match an unrelated numeric result.
    const continuation = value && tokens[index + value.next];
    const last = value && local[value.next - 1];
    const suffix = last?.text === ')' && continuation ? mathParser(tokens.slice(index + value!.next, index + value!.next + 80))(0) : undefined;
    // A separated prose label may follow a complete group. An attached token,
    // number, Greek/single-letter symbol or function term is an extra math factor.
    const extraFactor = last?.text === ')' && continuation && (
      continuation.start === last.end && continuation.kind !== 'other'
      || continuation.kind === 'number'
      || continuation.kind === 'identifier' && (/[\u0370-\u03ff]/u.test(continuation.text) || continuation.text.length === 1
        || /^(?:sin|cos|tan)$/u.test(continuation.text)
        || suffix?.symbol === false || tokens[index + value!.next + 1]?.text === '('));
    const incompleteProduct = value?.numeric && value.symbolic && local[value.next - 1]?.kind === 'identifier'
      && continuation?.kind === 'identifier';
    if (extraFactor || incompleteProduct || value?.symbolic && mathSyntax(continuation) && ![')', '=', '≈', '~', '<', '>', '≤', '≥', '≪'].includes(continuation!.text)
      && !(continuation!.text === '(' && groupBoundary(tokens, index + value.next))) {
      let endIndex = index + value!.next - 1 + (extraFactor ? suffix?.next ?? 1 : 0);
      let depth = 0;
      while (endIndex + 1 < tokens.length && tokens[endIndex + 1]!.end - token.start <= 160
        && !proseBoundary.test(tokens[endIndex + 1]!.text)) {
        const previous = tokens[endIndex]!, next = tokens[endIndex + 1]!;
        if ((next.kind === 'identifier' || next.kind === 'number') && (previous.kind === 'identifier' || previous.kind === 'number')) break;
        endIndex++;
        if (tokens[endIndex]!.text === '(') depth++;
        if (tokens[endIndex]!.text === ')' && --depth === 0) break;
      }
      const approximateProse = continuation!.text === '(' && !value.symbol
        && ['~', '≈'].includes(tokens[index + value.next + 1]?.text ?? '');
      if (approximateProse) continue;
      if (tokens.slice(index, endIndex + 1).some(item => item.kind === 'number')) {
        const end = Math.min(tokens[endIndex]!.end, token.start + 160);
        result.push({ key: input.slice(token.start, end), start: token.start, end, unsupported: true });
        index = endIndex;
      }
      continue;
    }
    if (!value || !value.numeric || !value.symbolic) continue;
    const endToken = local[value.next - 1]!, next = tokens[index + value.next];
    if (endToken.end - token.start > 160) {
      result.push({ key: input.slice(token.start, token.start + 160), start: token.start, end: token.start + 160, unsupported: true });
      index += value.next - 1;
      continue;
    }
    if (mathSyntax(next) && ![')', '=', '≈', '~', '<', '>', '≤', '≥', '≪'].includes(next!.text)
      || next?.kind === 'identifier' && next.start === endToken.end) continue;
    result.push({ key: value.key, start: token.start, end: endToken.end });
    index += value.next - 1;
  }
  return result;
}
