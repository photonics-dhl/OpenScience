export interface ProductReleaseViewport {
  name: string;
  width: number;
  height: number;
}

export interface ProductReleaseCase {
  surface: string;
  route: string;
  state: string;
  viewport: ProductReleaseViewport;
  reducedMotion: boolean;
}

export const PRODUCT_RELEASE_VIEWPORTS: readonly ProductReleaseViewport[];
export const PRODUCT_RELEASE_CASES: readonly ProductReleaseCase[];
export const PRODUCT_RELEASE_BUDGETS: Readonly<{ lcpMs: number; transferBytes: number; domNodes: number }>;
