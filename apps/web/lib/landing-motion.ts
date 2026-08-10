export function allowAutomaticEvolution(reducedMotion: boolean) {
  return !reducedMotion;
}

export function allowHeroLoop({ width, reducedMotion }: { width: number; reducedMotion: boolean }) {
  return width >= 1024 && !reducedMotion;
}
