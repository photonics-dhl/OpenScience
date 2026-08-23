export type WankoPresentationVariant = 'desktop' | 'mobile';

export function resolveWankoPresentationVariant(viewportWidth: number): WankoPresentationVariant {
  return viewportWidth <= 640 ? 'mobile' : 'desktop';
}

const NATIVE_PART_OPACITY = new Map([
  ['PARTS_01_BACKGROUND', 0],
  ['PARTS_01_BOWL', 0],
  ['PARTS_01_CORE', 0],
  ['PARTS_01_EFFECT', 0],
]);

export interface WankoPartState {
  getPartCount(): number;
  getPartId(index: number): unknown;
  setPartOpacityByIndex(index: number, opacity: number): void;
}

export interface WankoModelPlacement {
  positionX: number;
  positionY: number;
  scale: number;
}

export function getWankoModelPlacement(
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
  variant: WankoPresentationVariant = 'desktop',
): WankoModelPlacement {
  const mobile = variant === 'mobile';
  return {
    positionX: width / 2,
    positionY: height * (mobile ? .32 : .3),
    scale: Math.min(width / originalWidth, height / originalHeight) * (mobile ? 1.35 : 1.5),
  };
}

export function setWankoNativePresentation(parts: WankoPartState): number {
  let updated = 0;
  for (let index = 0; index < parts.getPartCount(); index += 1) {
    const opacity = NATIVE_PART_OPACITY.get(String(parts.getPartId(index)));
    if (opacity === undefined) continue;
    parts.setPartOpacityByIndex(index, opacity);
    updated += 1;
  }
  return updated;
}
