import { expect, test, type Page } from 'playwright/test';

const userId = '11111111-1111-4111-8111-111111111111';
const work = { category: 'Platform', period: '2025', shortTitle: 'Short work title', summary: 'Short personal contribution', fullTitle: 'Full work title', problem: 'A real question', contribution: 'My specific contribution', process: 'The work process', outcome: 'Team delivery', capabilities: ['Field work', 'Data analysis', 'Writing'], links: [{ label: 'Original paper', url: 'https://example.org/paper' }] };
const initial = { avatar: '', name: 'Test Researcher', englishName: '', title: 'Researcher', institution: 'Test Institute', lab: '', bio: 'A short biography', contactEmail: 'author@example.org', orcid: '', scholar: '', personalLinks: [{ label: 'Personal site', url: 'https://example.org/me' }], works: [work, { ...work, shortTitle: 'Second work', fullTitle: 'Second full title', links: [] }, { ...work, shortTitle: 'Third work', fullTitle: 'Third full title', links: [] }], interests: [{ title: 'Open questions', body: 'Looking for collaborators', kind: 'collaboration' as const, contact: 'Email welcome', active: true }, { title: 'Closed hiring', body: 'No longer hiring', kind: 'hiring' as const, contact: '', active: false }], materials: [{ label: 'Interview', url: 'https://example.org/interview' }], cv: '', labUrl: '', teamLinks: [{ label: 'Research team', url: 'https://example.org/team' }], education: [{ title: 'Doctoral study', details: 'Training group', url: '', stage: 'PhD', period: '2020–2024', links: [{ label: 'Mentor group', url: 'https://example.org/mentor' }] }] };
const emptyProfile: typeof initial = { ...initial, title: '', institution: '', lab: '', bio: '', contactEmail: '', personalLinks: [], works: [], interests: [], materials: [], teamLinks: [], education: [] };

async function setup(page: Page, authenticated = true, profile = initial) {
  let state = { profile: structuredClone(profile), version: 1, published: false, userId, connectedOrcid: null as string | null, orcidVerified: false };
  let publicProfile: typeof initial | null = null;
  type Body = { ownerId?: string; expectedVersion?: number; profile?: typeof initial };
  const writes: Array<{ method: string; path: string; body: Body | null }> = [];
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const body: Body | null = method === 'GET' ? null : route.request().postDataJSON();
    if (method !== 'GET') writes.push({ method, path, body });
    if (path === '/api/auth/me') return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? { userId, email: 'login@private.test', displayName: 'Test Researcher', status: 'email_verified', level: 'free' } : { error: { code: 'SESSION_INVALID', message: 'Unauthorized' } } });
    if (path === '/api/csrf-token') return route.fulfill({ json: { csrfToken: 'fixture' } });
    if (path === '/api/academic-profile/me') {
      if (method === 'PUT') { if (body?.expectedVersion !== state.version) return route.fulfill({ status: 409, json: { error: { code: 'PROFILE_VERSION_CONFLICT', message: 'Conflict' } } }); state = { ...state, profile: body.profile!, version: state.version + 1 }; }
      return route.fulfill({ json: state });
    }
    if (path === '/api/academic-profile/me/publish') { publicProfile = structuredClone(state.profile); state = { ...state, version: state.version + 1, published: true }; return route.fulfill({ json: state }); }
    if (path === '/api/academic-profile/me/unpublish') { publicProfile = null; state = { ...state, version: state.version + 1, published: false }; return route.fulfill({ json: { published: false, version: state.version, userId } }); }
    if (path === `/api/academic-profile/${userId}`) return publicProfile ? route.fulfill({ json: { profile: publicProfile, publications: [] } }) : route.fulfill({ status: 404, json: { error: { code: 'PROFILE_NOT_PUBLISHED', message: 'Not published' } } });
    return route.fulfill({ json: { workspaces: [], notifications: [], researchObjects: [] } });
  });
  return { writes, readState: () => state, setPublic: (profile: typeof initial | null) => { publicProfile = profile; } };
}

for (const width of [1440, 390]) {
  test(`empty owner and published layouts retain three cards and safe prompts at ${width}px`, async ({ page }) => {
    const fixture = await setup(page, true, emptyProfile);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/me/profile');
    await expect(page.getByRole('heading', { name: '你的学术生态主页' })).toBeVisible();
    await expect(page.locator('#main-content a[href="/me"]')).toHaveCount(0);
    for (const heading of ['代表工作与贡献', '当前关注与交流', '更多了解我']) await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText('工作名称')).toHaveCount(3);
    await expect(page.getByText('招生／求职／招聘／合作等意向')).toHaveCount(3);
    await expect(page.getByText('可添加公开邮箱、ORCID、个人主页链接')).toBeVisible();
    await page.screenshot({ path: `../../tmp/profile-20261010/academic-profile-empty-owner-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '添加代表工作' }).first().click();
    await expect(page.locator('#academic-editor-works')).toBeFocused();
    expect(fixture.readState().profile.works).toHaveLength(0);
    fixture.setPublic(emptyProfile);
    await page.goto(`/researchers/${userId}`);
    await expect(page.getByRole('heading', { name: '学术生态主页' })).toBeVisible();
    await expect(page.getByText('工作名称')).toHaveCount(3);
    await expect(page.getByText('招生／求职／招聘／合作等意向')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '添加代表工作' })).toHaveCount(0);
    await page.screenshot({ path: `../../tmp/profile-20261010/academic-profile-empty-public-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('partially filled public data keeps real items beside empty slots without showing closed intent', async ({ page }) => {
  const fixture = await setup(page, false);
  fixture.setPublic({ ...initial, works: [work], interests: initial.interests });
  await page.goto(`/researchers/${userId}`);
  await expect(page.getByRole('button', { name: 'Short work title' })).toBeVisible();
  await expect(page.getByText('工作名称')).toHaveCount(2);
  await expect(page.getByText('招生／求职／招聘／合作等意向')).toHaveCount(2);
  await expect(page.getByText('Closed hiring')).toHaveCount(0);
});

test('a transient public load error offers retry and then shows the profile', async ({ page }) => {
  const fixture = await setup(page, false); fixture.setPublic(initial);
  let fail = true;
  await page.route(`**/api/academic-profile/${userId}`, route => {
    if (fail) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'temporary' } } });
    return route.fallback();
  });
  await page.goto(`/researchers/${userId}`);
  await expect(page.getByText('暂时无法加载学术主页，请重试。')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByRole('heading', { name: '代表工作与贡献' })).toBeVisible();
});

test('an account switch does not show the previous account draft or keep saving locked', async ({ page }) => {
  await setup(page);
  const otherId = '22222222-2222-4222-8222-222222222222';
  let currentId = userId;
  let releaseOld: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const gate = new Promise<void>(resolve => { releaseOld = resolve; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me' && currentId === otherId) return route.fulfill({ json: { userId: otherId, email: 'other@private.test', displayName: 'Other Researcher', status: 'email_verified', level: 'free' } });
    if (path === '/api/academic-profile/me' && route.request().method() === 'GET' && currentId === otherId) return route.fulfill({ json: { profile: { ...initial, name: 'Other Researcher', bio: 'Only the other account' }, version: 1, published: false, userId: otherId } });
    if (path === '/api/academic-profile/me' && route.request().method() === 'PUT') { markStarted?.(); await gate; return route.fulfill({ json: { profile: { ...initial, bio: 'Old pending change' }, version: 2, published: false, userId } }); }
    return route.fallback();
  });
  await page.goto('/me/profile');
  await page.getByRole('button', { name: '编辑学术主页' }).click();
  await page.getByRole('textbox', { name: '简介', exact: true }).fill('Old pending change');
  await page.getByRole('button', { name: '保存草稿' }).first().click();
  await started;
  currentId = otherId;
  await page.evaluate(() => { const channel = new BroadcastChannel('openscience-session'); channel.postMessage('changed'); channel.close(); });
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('Other Researcher');
  await expect(page.getByRole('textbox', { name: '简介', exact: true })).toHaveValue('Only the other account');
  const oldResponse = page.waitForResponse(response => response.url().includes('/api/academic-profile/me') && response.request().method() === 'PUT');
  releaseOld?.();
  await oldResponse;
  await expect(page.getByRole('textbox', { name: '简介', exact: true })).toHaveValue('Only the other account');
  await page.getByRole('textbox', { name: '简介', exact: true }).fill('Other account edit');
  await expect(page.getByRole('button', { name: '保存草稿' }).first()).toBeEnabled();
});

test('Researcher entry opens owner preview, saves a private draft, then publishes explicit snapshot', async ({ page }) => {
  const fixture = await setup(page);
  await page.goto('/who-we-serve/researchers');
  await page.locator('a[href="/me/profile"]').click();
  await expect(page).toHaveURL(/\/me\/profile$/);
  await expect(page.getByRole('heading', { name: '你的学术生态主页' })).toBeVisible();
  await expect(page.getByText('Short work title')).toBeVisible();
  await page.getByRole('button', { name: '编辑学术主页' }).click();
  await page.getByRole('textbox', { name: '简介', exact: true }).fill('Updated private biography');
  await page.getByRole('button', { name: '保存草稿' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: '草稿已保存' }).first()).toBeVisible();
  expect(fixture.writes.find(item => item.path === '/api/academic-profile/me' && item.method === 'PUT')?.body?.profile?.bio).toBe('Updated private biography');
  await page.goto(`/researchers/${userId}`);
  await expect(page.getByText('此学术主页尚未公开。')).toBeVisible();
  await page.goto('/me/profile');
  await page.getByRole('button', { name: '编辑学术主页' }).click();
  await page.getByRole('button', { name: '发布当前草稿' }).click();
  await expect(page.getByRole('status').filter({ hasText: '主页已公开' }).first()).toBeVisible();
  await page.goto(`/researchers/${userId}`);
  await expect(page.getByText('Updated private biography')).toBeVisible();
  expect(fixture.readState().published).toBe(true);
});

for (const width of [1440, 390]) {
  test(`public profile at ${width}px keeps work details, links, education and canonical sharing usable`, async ({ page }) => {
    const fixture = await setup(page, false); fixture.setPublic(initial);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`/researchers/${userId}?from=share#academic-profile`);
    await expect(page.getByRole('heading', { name: '学术生态主页' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '代表工作与贡献' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '当前关注与交流' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '更多了解我' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '团队' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '求学经历' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '新闻/报道/会议...' })).toBeVisible();
    await expect(page.getByText('Closed hiring')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Personal site/ })).toHaveAttribute('target', '_blank');
    await page.screenshot({ path: `../../tmp/profile-20261010/academic-ecosystem-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Short work title' }).click();
    await expect(page.getByRole('dialog')).toContainText('Full work title');
    await expect(page.getByRole('dialog')).toContainText('My specific contribution');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Short work title' })).toBeFocused();
    await expect(page.getByRole('link', { name: /Original paper/ })).toHaveAttribute('target', '_blank');
    await page.getByRole('button', { name: '团队' }).click();
    await expect(page.getByRole('dialog')).toContainText('Research team');
    await expect(page.getByRole('dialog').getByRole('link', { name: /Research team/ })).toHaveAttribute('target', '_blank');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '求学经历' }).click();
    await expect(page.getByRole('dialog')).toContainText('Training group');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '新闻/报道/会议...' }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: /Interview/ })).toHaveAttribute('target', '_blank');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '分享主页' }).click();
    await expect(page.getByRole('dialog').getByRole('textbox', { name: '分享主页' })).toHaveValue(`${new URL(page.url()).origin}/researchers/${userId}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('new work, intent and education details persist while a closed intent stays private', async ({ page }) => {
  const fixture = await setup(page);
  await page.goto('/me/profile');
  await page.getByRole('button', { name: '编辑学术主页' }).click();
  await expect(page.getByRole('heading', { name: '新闻/报道/会议...' })).toBeVisible();
  await page.getByRole('textbox', { name: '工作成果（团队或项目）' }).first().fill('Updated team outcome');
  await page.getByRole('textbox', { name: '能力或经验' }).first().fill('Research design');
  await page.getByRole('textbox', { name: '联系说明' }).first().fill('Write to my public contact');
  await page.getByRole('textbox', { name: '阶段' }).fill('Postdoctoral');
  await page.getByRole('button', { name: '保存草稿' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: '草稿已保存' }).first()).toBeVisible();
  const saved = fixture.readState().profile;
  expect(saved.works[0].outcome).toBe('Updated team outcome');
  expect(saved.works[0].capabilities[0]).toBe('Research design');
  expect(saved.interests[0].contact).toBe('Write to my public contact');
  expect(saved.education[0].stage).toBe('Postdoctoral');
  await page.getByRole('button', { name: '发布当前草稿' }).click();
  await page.goto(`/researchers/${userId}`);
  await expect(page.getByText('Updated team outcome')).toBeVisible();
  await expect(page.getByText('Closed hiring')).toHaveCount(0);
});

test('connecting ORCID starts the existing OAuth flow only after the profile draft is saved', async ({ page }) => {
  const fixture = await setup(page);
  let started = false;
  await page.route('**/api/auth/orcid/start', route => { started = true; return route.fulfill({ json: { authorizationUrl: 'https://orcid.org/oauth/authorize?client_id=test' } }); });
  await page.route('https://orcid.org/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>OAuth test endpoint</body></html>' }));
  await page.goto('/me/profile');
  await page.getByRole('button', { name: '编辑学术主页' }).click();
  await page.getByRole('textbox', { name: '简介', exact: true }).fill('Unsaved change');
  await expect(page.getByRole('button', { name: '连接 ORCID' })).toBeDisabled();
  await page.getByRole('button', { name: '保存草稿' }).first().click();
  await expect(page.getByRole('button', { name: '连接 ORCID' })).toBeEnabled();
  const request = page.waitForRequest(request => request.url().endsWith('/api/auth/orcid/start'));
  await page.getByRole('button', { name: '连接 ORCID' }).click();
  expect((await request).postDataJSON()).toEqual({ returnTo: '/me/profile' });
  expect(started).toBe(true);
  expect(fixture.readState().profile.bio).toBe('Unsaved change');
});
