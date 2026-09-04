export interface PresentationMediaGenerator {
  generate(input: { kind: 'image' | 'video'; sourceClaimIds: string[] }): Promise<{ bytes: Buffer; contentType: string; generator: string; generatorVersion: string; promptHash: string }>;
}

export function requirePresentationMediaGenerator(generator: PresentationMediaGenerator | undefined): PresentationMediaGenerator {
  if (!generator) throw new Error('[blocked] MiniMax presentation media capability is disabled');
  return generator;
}
