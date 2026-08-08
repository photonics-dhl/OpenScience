function getPromptBlock(markdown, heading) {
  const headingMatch = new RegExp(`^## ${heading}\\s*$`, 'm').exec(markdown);
  if (!headingMatch || headingMatch.index === undefined) {
    return undefined;
  }

  const contentAfterHeading = markdown.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingIndex = contentAfterHeading.search(/^##\s+/m);
  const section = nextHeadingIndex >= 0
    ? contentAfterHeading.slice(0, nextHeadingIndex)
    : contentAfterHeading;
  const textBlock = /```text[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```/.exec(section);

  return textBlock?.[1].trim();
}

export function buildImagePrompt(markdown) {
  const positive = getPromptBlock(markdown, 'MiniMax Prompt');
  const negative = getPromptBlock(markdown, 'Negative Prompt');

  if (!positive || !negative) {
    throw new Error('Prompt manifest is missing MiniMax Prompt or Negative Prompt');
  }

  const prompt = `${positive}\n\nConstraints to avoid:\n${negative}`;
  if (prompt.length >= 1500) {
    throw new Error('Combined MiniMax image prompt must be fewer than 1500 characters');
  }

  return prompt;
}
