import { expect, test, type Page } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const outDir = 'test/visual/out/research-workbench-review';

async function openReview(page: Page, view = 'dashboard') {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\//u.test(new URL(request.url()).pathname)) requests.push(request.url());
  });
  await page.goto(`${baseUrl}/_visual/research-workbench?view=${view}`, {
    waitUntil: 'domcontentloaded',
  });
  return requests;
}

test('returning researchers see the active decision before review chrome with locale-aware reading', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReview(page);

  const session = page.locator('[data-review-session-priority="true"]');
  const utility = page.locator('[data-review-utility="true"]');
  await expect(session).toBeVisible();
  await expect(utility).toBeVisible();
  const sessionBox = await session.boundingBox();
  const utilityBox = await utility.boundingBox();
  expect(sessionBox?.y).toBeLessThan(utilityBox?.y ?? 0);

  const path = page.locator('[data-session-path="true"]');
  await expect(path.locator('li')).toHaveCount(3);
  await expect(path.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(path.locator('[aria-current="step"]')).toContainText(/证据|Evidence/u);

  const reading = page.locator('[data-reading-copy="true"]').first();
  await expect(reading).toHaveCSS('font-size', '18px');
  await expect(reading).toHaveCSS('line-height', '30.24px');
  expect(await reading.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/Source_Serif_4/u);

  await page.context().addCookies([{
    name: 'NEXT_LOCALE',
    url: new URL(page.url()).origin,
    value: 'zh',
  }]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('[data-reading-copy="true"]').first()).toHaveCSS('font-size', '18px');
  await expect(page.locator('[data-reading-copy="true"]').first()).toHaveCSS('line-height', '32.76px');
  expect(await page.locator('[data-reading-copy="true"]').first().evaluate(
    (element) => getComputedStyle(element).fontFamily,
  )).toMatch(/Source_Serif_4.*Noto_Serif_SC/u);
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute(
    'data-hermes-rig-status',
    'ready',
    { timeout: 20_000 },
  );
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('[data-review-hermes-trigger="true"]').click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ fullPage: true, path: `${outDir}/dashboard-zh-reading.png` });

  const menuTextSize = await page.getByRole('menuitem').first().locator('strong').evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(menuTextSize).toBeGreaterThanOrEqual(14);
  await expect(page.locator('[role="menu"] [data-review-menu-eyebrow="true"]')).toHaveCSS('letter-spacing', 'normal');
  await expect(page.locator('[role="menu"] [data-review-menu-shortcut="true"]')).toHaveCSS('letter-spacing', 'normal');
});

test('the primary decision action advances to evidence review', async ({ page }) => {
  await openReview(page);

  await page.getByRole('button', { name: /打开证据对照|Open evidence comparison/u }).click();
  await expect(page.getByRole('tab', { name: /审阅|Review/u })).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).searchParams.get('view')).toBe('review');
  await expect(page.locator('[data-evidence-rail="true"]')).toBeVisible();
});

test('Dashboard exposes the real-size Hermes contextual menu and assistant click', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requests = await openReview(page);

  await expect(page.getByRole('heading', { name: /层状材料中的超快电荷转移|Ultrafast charge transfer in layered matter/iu })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('[data-review-hermes-trigger="true"]').click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.locator('[data-review-hermes-size="360"]')).toHaveCSS('width', '360px');
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await page.screenshot({ fullPage: true, path: `${outDir}/dashboard-default-menu.png` });

  await page.keyboard.press('Escape');
  await page.locator('[data-review-hermes-trigger="true"]').click();
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toBeVisible();
  const assistantInput = page.getByRole('textbox');
  await assistantInput.evaluate((element) => {
    element.addEventListener('keydown', (event) => {
      (window as Window & { __assistantMenuKeyDefaultPrevented?: boolean })
        .__assistantMenuKeyDefaultPrevented = event.defaultPrevented;
    });
  });
  await assistantInput.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await page.evaluate(() => (
    window as Window & { __assistantMenuKeyDefaultPrevented?: boolean }
  ).__assistantMenuKeyDefaultPrevented)).toBe(false);
  await page.getByRole('button', { name: /关闭|Close/u }).click();

  await page.locator('[data-review-hermes-trigger="true"]').click({ button: 'right' });
  await expect(page.getByRole('menu', { name: /围绕这一步|Around this decision/u })).toBeVisible();
  await page.getByRole('menuitem', { name: /陪我读到本段结束|Read with me to the end/u }).focus();
  await expect(page.getByRole('menuitem', { name: /陪我读到本段结束|Read with me to the end/u })).toBeFocused();
  await page.screenshot({ fullPage: true, path: `${outDir}/dashboard-menu-focus.png` });
  await page.keyboard.press('Enter');
  await expect(page.locator('[aria-live="polite"]')).toContainText(/我把提醒收好了|I’ve put the reminders away/u);
  await page.screenshot({ fullPage: true, path: `${outDir}/dashboard-companion-feedback.png` });
  expect(requests).toEqual([]);
});

test('keyboard menu access, quiet editor metrics and review acknowledgement work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openReview(page, 'editor');

  const trigger = page.locator('[data-review-hermes-trigger="true"]');
  await expect(page.locator('[data-review-hermes-size="360"]')).toBeVisible();
  await trigger.scrollIntoViewIfNeeded();
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });

  const editorTab = page.getByRole('tab', { name: /编辑|Editor/u });
  await editorTab.focus();
  await page.keyboard.press('ArrowRight');
  expect(new URL(page.url()).searchParams.get('view')).toBe('review');
  await expect(page.getByRole('tab', { name: /审阅|Review/u })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  expect(new URL(page.url()).searchParams.get('view')).toBe('editor');
  await expect(editorTab).toHaveAttribute('aria-selected', 'true');

  await trigger.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();

  const reading = page.locator('[data-reading-copy="true"]').first();
  await expect(reading).toHaveCSS('font-size', '18px');
  await expect(reading).toHaveCSS('line-height', '30.24px');

  await page.keyboard.press('Escape');
  expect(await page.getByRole('menu').count()).toBe(0);
  await trigger.focus();
  await page.keyboard.press('ContextMenu');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ fullPage: true, path: `${outDir}/editor-quiet.png` });
  await page.getByRole('tab', { name: /审阅|Review/u }).click();
  await expect(page.locator('[data-evidence-rail="true"]')).toBeVisible();
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await page.getByRole('button', { name: /接受这条建议|Accept suggestion/u }).click();
  await expect(page.locator('[aria-live="polite"]')).toContainText(/已记录|Recorded/u);
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await page.screenshot({ fullPage: true, path: `${outDir}/review-evidence.png` });
});

test('mobile long press opens the compact menu without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReview(page, 'mobile');

  const trigger = page.locator('[data-review-hermes-trigger="true"]');
  await expect(page.locator('[data-review-hermes-size="200"]')).toHaveCSS('width', '200px', { timeout: 20_000 });
  await trigger.scrollIntoViewIfNeeded();
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await trigger.dispatchEvent('pointerdown', {
    button: 0,
    clientX: 100,
    clientY: 100,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  await trigger.dispatchEvent('pointermove', {
    clientX: 116,
    clientY: 100,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  await page.waitForTimeout(560);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await trigger.dispatchEvent('pointerup', {
    button: 0,
    clientX: 116,
    clientY: 100,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  await trigger.dispatchEvent('pointerdown', {
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  await page.waitForTimeout(560);
  await trigger.dispatchEvent('pointerup', {
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  await expect(page.getByRole('menu')).toBeVisible();
  await trigger.dispatchEvent('click');
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/mobile-long-press.png` });

  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(750);
  await trigger.click();
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toBeVisible();
});

test('reduced motion removes decorative transition timing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openReview(page);

  await expect(page.locator('[data-research-workbench-review="true"]')).toHaveAttribute(
    'data-motion',
    'reduced',
  );
  const duration = await page.locator('[data-review-hermes-feedback="true"]').evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(duration).toBe('0s');
});

test('a real Wanko portrait remains visible when WebGL2 is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (kind === 'webgl2') return null;
      return original.call(this, kind as '2d', ...args as []) as RenderingContext | null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await openReview(page, 'editor');

  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'fallback');
  const fallback = page.locator('[data-review-hermes-fallback="true"]');
  await expect(fallback).toBeVisible();
  expect(await fallback.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThanOrEqual(360);
});
