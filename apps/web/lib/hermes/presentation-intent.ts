export interface HermesPresentationIntent {
  action: 'storyboard.create' | 'storyboard.revise' | 'scene.image' | 'video.create';
  instruction: string;
  sceneIndex?: number;
  revisionSceneIndex?: number;
}

export function researchObjectFromHermesPath(pathname: string): string | undefined {
  const id = /^\/research-objects\/([^/]+)(?:\/|$)/u.exec(pathname)?.[1];
  return id && id !== 'new' ? id : undefined;
}
