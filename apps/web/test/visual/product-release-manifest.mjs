export const PRODUCT_RELEASE_VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'mobile', width: 390, height: 844 },
]);

const surfaces = Object.freeze([
  { surface: 'landing', route: '/', state: 'optical-resting', motionContract: 'visible-optical' },
  { surface: 'workspace', route: '/research-objects/ro-release/edit', state: 'proposal-ready' },
  { surface: 'public', route: '/research/OSR-DEMO-000001/v/1', state: 'published-reading' },
  { surface: 'auth', route: '/auth/register', state: 'request-code' },
  { surface: 'login', route: '/auth/login', state: 'returning-researcher' },
  { surface: 'dashboard', route: '/dashboard', state: 'approval-ready' },
  { surface: 'intake', route: '/research-objects/new?mode=import', state: 'mixed-evidence' },
  { surface: 'review', route: '/research-objects/ro-release/hermes?task=ingestion-release', state: 'evidence-confirmation' },
  { surface: 'overview', route: '/research-objects/ro-release/overview', state: 'research-map' },
  { surface: 'files', route: '/research-objects/ro-release/files', state: 'evidence-ledger' },
  { surface: 'versions', route: '/research-objects/ro-release/versions', state: 'version-history' },
  { surface: 'collaboration', route: '/research-objects/ro-release/collab', state: 'review-queue' },
  { surface: 'publish', route: '/research-objects/ro-release/publish', state: 'release-readiness' },
  { surface: 'sandbox', route: '/research-objects/ro-release/sandbox', state: 'reproducibility-run' },
  { surface: 'settings', route: '/settings', state: 'identity-preferences' },
  { surface: 'explore', route: '/explore', state: 'launch-corpus' },
  { surface: 'collection', route: '/collections/ultrafast-science', state: 'selected-media' },
  { surface: 'admin', route: '/admin/editorial', state: 'curation-queue' },
]);

export const PRODUCT_RELEASE_CASES = Object.freeze([
  ...surfaces.flatMap((surface) => PRODUCT_RELEASE_VIEWPORTS.map((viewport) => ({ ...surface, viewport, reducedMotion: false }))),
  ...PRODUCT_RELEASE_VIEWPORTS.map((viewport) => ({
    ...surfaces[0],
    state: 'optical-reduced',
    viewport,
    reducedMotion: true,
    motionContract: 'static-optical',
  })),
]);

export const PRODUCT_RELEASE_BUDGETS = Object.freeze({
  lcpMs: 4_000,
  transferBytes: 3_500_000,
  domNodes: 1_800,
});
