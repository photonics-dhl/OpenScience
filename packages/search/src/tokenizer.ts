export interface SearchToken {
  term: string;
  start: number;
  end: number;
}

const SEARCH_TOKEN_PATTERN = /\p{Script=Han}+|[\p{L}\p{N}]+/gu;
const HAN_PATTERN = /^\p{Script=Han}+$/u;

function normalizeTerm(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('und');
}

export function tokenizeSearchTextWithOffsets(text: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  for (const match of text.matchAll(SEARCH_TOKEN_PATTERN)) {
    const raw = match[0];
    const start = match.index;
    if (HAN_PATTERN.test(raw)) {
      const characters = Array.from(raw);
      const offsets: number[] = [];
      let cursor = start;
      for (const character of characters) {
        offsets.push(cursor);
        cursor += character.length;
      }
      if (characters.length === 1) {
        tokens.push({ term: normalizeTerm(characters[0]!), start, end: cursor });
        continue;
      }
      for (let index = 0; index < characters.length - 1; index += 1) {
        tokens.push({
          term: normalizeTerm(`${characters[index]}${characters[index + 1]}`),
          start: offsets[index]!,
          end: offsets[index + 1]! + characters[index + 1]!.length,
        });
      }
      continue;
    }
    tokens.push({ term: normalizeTerm(raw), start, end: start + raw.length });
  }
  return tokens;
}

export function tokenizeSearchText(text: string): string[] {
  return tokenizeSearchTextWithOffsets(text).map(({ term }) => term);
}

