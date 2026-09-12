export interface HermesPresentationIntent {
  action: 'storyboard.create' | 'storyboard.revise' | 'scene.image' | 'video.create';
  instruction: string;
  sceneIndex?: number;
}

/** These shortcuts prepare a review card only; they never grant write authority. */
export function routeHermesPresentationIntent(goal: string): HermesPresentationIntent | null {
  const instruction = goal.trim();
  if (!instruction || /(?:不要|别|不需要|发布|删除|\b(?:don't|do not|publish|delete)\b)/iu.test(instruction)) return null;
  const presentation = /(?:分镜|讲解稿|配图|图片|第[一二三四五六\d]+幕|\b(?:storyboard|scene\s*\d+|illustration)\b)/iu;
  if (presentation.test(instruction) && /(?:改写|修改|调整|改成|改得|改为|\b(?:revise|rewrite|change|adjust)\b)/iu.test(instruction)) {
    return { action: 'storyboard.revise', instruction };
  }
  const zhImage = /^(?:请)?(?:帮我)?(?:为|给)?第([一二三四五六1-6])幕(?:生成图片|生成配图|生图|配图)[。！!]?$/u.exec(instruction);
  const enImage = /^(?:please\s+)?(?:generate|create|draw)\s+(?:an?\s+)?(?:image|illustration)\s+for\s+scene\s+([1-6])[.!]?$/iu.exec(instruction);
  if (zhImage || enImage) {
    const number = (zhImage ?? enImage)![1];
    const index = '一二三四五六'.indexOf(number);
    return { action: 'scene.image', instruction, sceneIndex: index >= 0 ? index : Number(number) - 1 };
  }
  if (/(?:生成视频|制作视频|视频讲解|\b(?:generate|create|make)\s+(?:a\s+)?video\b)/iu.test(instruction)) return { action: 'video.create', instruction };
  if (/^(?:(?:请)?(?:帮我)?(?:生成图片|生成配图|生图)|(?:please\s+)?(?:generate|create|draw)\s+(?:an?\s+)?(?:image|illustration))[。！!.]?$/iu.test(instruction)) return { action: 'scene.image', instruction };
  if (/^(?:请)?(?:帮我)?(?:生成|写|制作|创建).*(?:分镜|讲解稿)/u.test(instruction)
    || /^(?:please\s+)?(?:create|generate|write|make)\s+(?:an?\s+)?(?:new\s+)?storyboard\b/iu.test(instruction)) return { action: 'storyboard.create', instruction };
  return null;
}

export function researchObjectFromHermesPath(pathname: string): string | undefined {
  const id = /^\/research-objects\/([^/]+)(?:\/|$)/u.exec(pathname)?.[1];
  return id && id !== 'new' ? id : undefined;
}
