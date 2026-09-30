const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');

// Load the real, side-effect-free selector functions without the operator's CLI,
// browser connection, filesystem publication or installed server Playwright runtime.
const source = fs.readFileSync(require.resolve('./review-runner.cjs'), 'utf8');

// The external seam is Playwright's file chooser; validation and upload below
// execute the real operator helpers, with a mutable fake job file.
function attachmentFixture({ modern = true, accept = null, replaceAfterRead = false, png = false, native = false, wrapped = false } = {}) {
  const original = png ? Buffer.alloc(32) : Buffer.from('%PDF-1.7\noriginal validated paper\n%%EOF\n');
  if (png) { Buffer.from('89504e470d0a1a0a', 'hex').copy(original); original.writeUInt32BE(20, 16); original.writeUInt32BE(10, 20); }
  const replacement = png ? Buffer.from(original) : Buffer.from('%PDF-1.7\na different paper\n%%EOF\n');
  if (png) replacement[28] = 1;
  const fileName = png ? 'page-1.png' : 'source.pdf';
  let current = original, now = 0;
  const uploaded = [], labels = [];
  const state = { nativeLabels: [], unpaired: false, busy: 0 };
  const capture = async value => {
    uploaded.push(typeof value === 'string' ? { buffer: current } : value);
    if (native) state.nativeLabels.push('source(2).pdf');
    else labels.push(fileName);
  };
  const fileInput = { count: async () => modern ? 3 : 1, setInputFiles: capture };
  const node = (tagName, label, wrapper = null) => ({ tagName,
    getAttribute: name => name === 'aria-label' ? label : name === 'role' && tagName === 'DIV' ? 'button' : null,
    closest: () => wrapper });
  function elements() {
    const wrappers = wrapped ? state.nativeLabels.map(label => node('DIV', label)) : [];
    const old = [...labels.map(label => node('DIV', label)), ...wrappers];
    const buttons = ['Add files and more', 'Select ChatGPT model', 'Dictate', 'Send'].map(label => node('BUTTON', label));
    state.nativeLabels.forEach((label, index) => {
      buttons.push(node('BUTTON', label, wrappers[index]));
      if (!state.unpaired) buttons.push(node('BUTTON', `Remove ${label}`, wrappers[index]));
    });
    return { old, buttons, all: [...old, ...buttons] };
  }
  const previews = { count: async () => elements().old.length, evaluateAll: async fn => fn(elements().old) };
  // These exact native labels mirror the server's no-send PDF receipt. The
  // unrelated controls are in the same composer and must not count as files.
  const buttons = { evaluateAll: async fn => fn(elements().buttons) };
  const mixed = { evaluateAll: async fn => fn(elements().all) };
  const add = { count: async () => modern ? 1 : 0, isVisible: async () => true,
    isEnabled: async () => true, click: async () => {} };
  const form = { count: async () => 1, getByRole: () => add,
    locator: query => query === 'input[type="file"]' ? fileInput
      : query.includes('aria-busy') ? { count: async () => state.busy }
        : query.includes(', button[') ? mixed : query.startsWith('button[') ? buttons : previews };
  const input = { locator: () => form };
  const chooser = { element: async () => ({ getAttribute: async name => name === 'aria-label' ? 'Attach files' : accept }),
    setFiles: capture };
  const page = { evaluate: async () => 'xgs-review-upload-test',
    getByRole: () => ({ count: async () => 1, isVisible: async () => true, click: async () => {} }),
    waitForEvent: async () => chooser };
  const sandbox = { fs: {
    lstatSync: () => ({ isFile: () => true, isSymbolicLink: () => false, size: current.length }),
    readFileSync: () => { const bytes = Buffer.from(current); if (replaceAfterRead) current = replacement; return bytes; },
  }, path, crypto, Buffer, dir: '/test-job', id: 'upload-test',
    MAX_ATTACHMENT_BYTES: 4 * 1024 * 1024, IMAGE_REVIEW_MAX_ATTACHMENT_BYTES: 10 * 1024 * 1024,
    MAX_TOTAL_ATTACHMENT_BYTES: 24 * 1024 * 1024,
    Date: { now: () => now }, setTimeout: fn => { now += 250; fn(); }, attachmentDiagnostic: undefined };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('function reviewAttachments('), source.indexOf('function normalizeUserText(')), sandbox);
  const request = { schemaVersion: png ? 3 : 1, attachments: [{ fileName, mediaType: png ? 'image/png' : 'application/pdf',
    ...(png ? { pageNumber: 1, width: 20, height: 10 } : {}),
    sha256: crypto.createHash('sha256').update(original).digest('hex') }] };
  return { upload: () => sandbox.uploadAttachments(page, input, request),
    ready: () => sandbox.attachmentsReady(input, request), original, uploaded, state };
}

test('confirms the observed native PDF card and final readiness, excluding same-form controls', async () => {
  const f = attachmentFixture({ native: true });
  await f.upload();
  assert.equal(f.uploaded.length, 1);
  assert.equal(await f.ready(), true);
});

test('final readiness accepts the observed renamed native PDF card', async () => {
  const f = attachmentFixture({ native: true });
  f.state.nativeLabels = ['source(2).pdf'];
  assert.equal(await f.ready(), true);
});

test('a native button inside its same-label legacy card remains one physical attachment', async () => {
  const f = attachmentFixture({ native: true, wrapped: true });
  await f.upload();
  assert.equal(await f.ready(), true);
});

test('distinct wrapped cards with the same filename still reject duplicate attachments', async () => {
  const f = attachmentFixture({ native: true, wrapped: true });
  f.state.nativeLabels = ['source(2).pdf', 'source(2).pdf'];
  assert.equal(await f.ready(), false);
});

for (const [name, mutate] of Object.entries({
  'foreign text file': f => { f.state.nativeLabels.push('notes.txt'); },
  'duplicate expected file': f => { f.state.nativeLabels.push('source(2).pdf'); },
  'wrong filename': f => { f.state.nativeLabels = ['other.pdf']; },
  'busy upload': f => { f.state.busy = 1; },
  'unpaired native label': f => { f.state.unpaired = true; },
})) test(`final native attachment readiness rejects ${name} before send`, async () => {
  const f = attachmentFixture({ native: true }); let sent = 0;
  f.state.nativeLabels = ['source(2).pdf'];
  mutate(f);
  if (await f.ready()) sent++;
  assert.equal(sent, 0);
});

for (const modern of [true, false]) test(`uploads the validated bytes despite replacement in ${modern ? 'modern' : 'legacy'} flow`, async () => {
  const f = attachmentFixture({ modern, replaceAfterRead: true });
  await f.upload();
  assert.equal(f.uploaded.length, 1);
  assert.deepEqual(f.uploaded[0].buffer, f.original);
  assert.equal(f.uploaded[0].name, 'source.pdf');
  assert.equal(f.uploaded[0].mimeType, 'application/pdf');
  assert.equal(await f.ready(), true);
});

for (const modern of [true, false]) test(`preserves validated image-review bytes in ${modern ? 'modern' : 'legacy'} flow`, async () => {
  const f = attachmentFixture({ modern, replaceAfterRead: true, png: true });
  await f.upload();
  assert.equal(f.uploaded.length, 1);
  assert.deepEqual(f.uploaded[0].buffer, f.original);
  assert.equal(f.uploaded[0].name, 'page-1.png');
  assert.equal(f.uploaded[0].mimeType, 'image/png');
  assert.equal(await f.ready(), true);
});

for (const accept of [null, '']) test(`modern PDF upload accepts unrestricted input ${JSON.stringify(accept)}`, async () => {
  const f = attachmentFixture({ accept });
  await f.upload();
  assert.equal(f.uploaded.length, 1);
});

for (const accept of ['image/*', 'image/*,video/*']) test(`rejects restricted input ${accept} before upload`, async () => {
  const f = attachmentFixture({ accept });
  await assert.rejects(f.upload(), /ATTACHMENT_INPUT_NOT_READY/);
  assert.equal(f.uploaded.length, 0);
});
function selector(onTick = () => {}) {
  let now = 0;
  const sandbox = { Date: { now: () => now }, setTimeout: fn => { now += 250; onTick(); fn(); } };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('function normalizeComposerText('), source.indexOf('async function normalChatMode(')), sandbox);
  return sandbox.selectReviewModelOnFreshPage;
}

function activeChecks(f) {
  let now = 0;
  const sandbox = { Date: { now: () => now }, setTimeout: fn => { now += 100; f.tick?.(); fn(); },
    bounded: async value => value, composer: async () => f.input };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('function normalizeComposerText('), source.indexOf('async function resolveCanonicalConversation(')), sandbox);
  Object.assign(sandbox, { page: f.page, input: f.input, ownedName: 'owned',
    request: { model: 'chatgpt-web/6-pro', deadlineAt: 5000 }, prompt: 'saved full prompt', actualPrompt: 'saved full prompt',
    composerText: async () => f.state.prompt,
    attachmentsReady: async () => f.state.attachments.length === 1 && f.state.attachments[0] === 'original.pdf',
    send: { isEnabled: async () => true } });
  const finalGuards = source.slice(source.indexOf('  // Model verification may open the owned menu.'), source.indexOf("  stage = 'submission';"));
  if (finalGuards) vm.runInContext(`async function finalSubmissionCheck() { ${finalGuards}\nreturn true; }`, sandbox);
  return sandbox;
}

// Mirrors the observed local Chinese menu. It does not claim the server has this UI.
function strengthFixture({ header = '6\nPro', headers = 1, status = 'Pro，第 5 项，共 5 项。',
  intensity = true, sliderNow = '4', sliderMax = '4', sliderCount = 1, disabled = false,
  opens = true, stale = false, closes = true, foreignSlider = false, english = false, delayedHeader = false,
  intensityDisabled = false, headerDisabled = false, intensityAncestorBlocked = false, headerAncestorBlocked = false,
  statusCount = 1, closedLabel } = {}) {
  const events = [];
  const state = { open: stale, header, status, ticks: 0, prompt: 'saved full prompt', attachments: ['original.pdf'] };
  const empty = new Locator([]);
  const intensityNode = { name: 'uninterpreted localized intensity', disabled: intensityDisabled, ancestorBlocked: intensityAncestorBlocked };
  const intensityItem = new Locator(intensity ? [intensityNode] : []);
  const slider = new Locator(Array.from({ length: sliderCount }, () => ({ locator: () => intensityItem, attrs: {
    'aria-hidden': 'true', 'aria-valuemin': '0', 'aria-valuemax': sliderMax, 'aria-valuenow': sliderNow } })));
  const menuNode = { popup: true, locator: () => slider, contains: element => !foreignSlider && element === intensityNode };
  const menu = new Locator(() => state.open ? [menuNode] : []);
  menuNode.getByRole = (role, options) => {
    if (role === 'menuitem' && options?.name?.test(english ? 'Select model' : '选择模型'))
      return new Locator(() => delayedHeader && state.ticks < 3 ? [] : Array.from({ length: headers }, () => ({ label: () => state.header, disabled: headerDisabled, ancestorBlocked: headerAncestorBlocked })));
    if (role === 'status') return new Locator(state.status === null ? [] : Array.from({ length: statusCount }, () => ({ label: () => state.status })));
    return empty;
  };
  const control = new Locator([{ label: () => closedLabel ?? (english ? 'Thinking effort' : '思考强度'), disabled, controls: 'strength-menu',
    attrs: { get 'aria-expanded'() { return String(state.open); } },
    click: () => { events.push('open'); state.open = opens; },
    press: () => { events.push('close'); if (closes) state.open = false; state.onClose?.(); } }]);
  const form = new Locator([{ getByRole: (role, options) => role === 'button'
    && (typeof options.name === 'string' ? options.name === (english ? 'Select ChatGPT model' : '选择 ChatGPT 模型')
      : options.name.test(english ? 'Select ChatGPT model' : '选择 ChatGPT 模型')) ? control : empty }]);
  const input = { locator: () => form, evaluate: async () => true };
  const page = { evaluate: async () => 'owned', locator: expression => expression.includes('[id=') ? menu
    : expression.includes(':visible') ? new Locator(() => state.open ? [menuNode] : []) : empty };
  return { page, input, state, events, tick: () => state.ticks++ };
}

function fixture({ direct = false, family = '6 High', thinking = 1, power = 1, disabled = false,
  active = '6\nPro', ownership = 'owned', foreignPower = false, foreignMenu = false,
  linked = true, opens = true, alreadyOpen = false, extraPopup = false, effortDisabled = false,
  delayedPower = false, submenu = 'inline' } = {}) {
  const clicks = [];
  const state = { menu: alreadyOpen, effort: false, label: family, ticks: 0 };
  const empty = new Locator([]);
  function node(name, click, extra = {}) { return { name, click, ...extra }; }
  const pro = node('6 Pro', () => { clicks.push('pro'); state.label = active; state.menu = false; }, { disabled });
  const radios = Array.from({ length: direct === true ? 1 : Number(direct) || 0 }, () => pro);
  const powers = Array.from({ length: power }, () => node('Power', () => { clicks.push('power'); state.label = active; state.menu = false; }, { disabled }));
  const efforts = Array.from({ length: thinking }, () => node('Thinking effort', () => { clicks.push('effort'); state.effort = true; },
    { disabled: effortDisabled, controls: submenu === 'linked' ? 'effort-picker' : undefined }));
  const menuNode = node('picker', null, { popup: true });
  const foreignNode = node('foreign', null, { popup: true });
  const extraNode = node('extra', null, { popup: true });
  const effortNode = node('effort-picker', null, { popup: true });
  const ready = () => state.effort && (!delayedPower || state.ticks >= 3);
  const expanded = () => state.effort && submenu !== 'inline' && (!delayedPower || state.ticks >= 1);
  effortNode.getByText = text => new Locator(() => text === 'Power' && ready() ? powers : []);
  const effortMenu = new Locator(() => expanded() ? [effortNode] : []);
  const menu = new Locator(() => state.menu ? [menuNode] : []);
  menu.getByText = (text) => new Locator(() => !state.menu ? [] : text === 'Thinking effort' ? efforts : text === 'Power' && submenu === 'inline' && ready() ? powers : []);
  menuNode.getByText = menu.getByText;
  menu.getByRole = (role, options) => role === 'menuitemradio' && direct && options.name.test('6 Pro') ? new Locator(radios) : empty;
  const control = new Locator([node(family, () => { clicks.push('model'); state.menu = opens; }, { controls: linked ? 'picker' : undefined, label: () => state.label })]);
  const form = new Locator([node('form')]);
  form.getByRole = () => control;
  const input = { locator: () => form };
  const page = {
    evaluate: async () => ownership,
    locator: expression => {
      if (expression.includes('aria-label="Select model"')) return empty;
      if (expression.includes('effort-picker')) return effortMenu;
      if (expression.includes('picker')) return menu;
      if (expression.includes(':visible')) return new Locator(() => [...(state.menu ? [menuNode] : []),
        ...(foreignMenu ? [foreignNode] : []), ...(extraPopup && state.menu ? [extraNode] : []), ...(expanded() ? [effortNode] : [])]);
      return empty;
    },
    getByRole: (role, options) => role === 'menuitemradio' && state.menu && direct && options.name.test('6 Pro') ? new Locator(radios) : empty,
    getByText: () => foreignPower ? new Locator([node('Power', () => clicks.push('foreign-power'))]) : empty,
    keyboard: { press: async () => { state.menu = false; } },
  };
  return { page, input, clicks, tick: () => { if (state.effort) state.ticks++; } };
}

class Locator {
  constructor(nodes) { this.nodes = typeof nodes === 'function' ? nodes : () => nodes; }
  async count() { return this.nodes().length; }
  nth(index) { return new Locator(() => this.nodes().slice(index, index + 1)); }
  async isVisible() { return this.nodes().length > 0; }
  async isEnabled() { return !this.nodes()[0]?.disabled; }
  async getAttribute(name) { return name === 'aria-controls' ? this.nodes()[0]?.controls ?? null : name === 'aria-disabled' ? String(Boolean(this.nodes()[0]?.disabled)) : this.nodes()[0]?.attrs?.[name] ?? null; }
  async innerText() { const n = this.nodes()[0]; return n?.label ? n.label() : n?.name ?? ''; }
  async click() { assert.equal(await this.count(), 1); assert.equal(await this.isEnabled(), true); this.nodes()[0].click?.(); }
  async press(key) { assert.equal(key, 'Escape'); this.nodes()[0]?.press?.(); }
  async waitFor() { if (!await this.isVisible()) throw new Error('timeout'); }
  async evaluate(fn, arg) {
    const n = this.nodes()[0];
    if (Array.isArray(arg)) return arg.includes(n);
    if (arg && typeof arg === 'object') return fn(n, arg);
    return Boolean(n?.disabled || n?.ancestorBlocked);
  }
  async elementHandles() { return this.nodes(); }
  async elementHandle() { return this.nodes()[0] ?? null; }
  locator(expression) { return this.nodes()[0]?.locator?.(expression) ?? new Locator([]); }
  getByRole(role, options) { return this.nodes()[0]?.getByRole?.(role, options) ?? new Locator([]); }
  getByText(text, options) { return this.nodes()[0]?.getByText?.(text, options) ?? new Locator([]); }
}

test('observes already selected 6 Pro in the owned strength popup and closes without changing the draft', async () => {
  const f = strengthFixture(), checks = activeChecks(f);
  await checks.selectReviewModelOnFreshPage(f.page, f.input, 'owned', 5000, { model: 'chatgpt-web/6-pro' });
  assert.deepEqual(f.events, ['open', 'close']);
  assert.equal(f.state.open, false);
  assert.equal(f.state.prompt, 'saved full prompt');
  assert.deepEqual(f.state.attachments, ['original.pdf']);
});

test('composer readiness and final active check reopen the popup and reject changed model without send', async () => {
  const f = strengthFixture(), checks = activeChecks(f), request = { model: 'chatgpt-web/6-pro' };
  assert.equal(await checks.waitForComposer(f.page, 5000, request, 'owned'), f.input);
  assert.equal(f.state.open, false);
  f.state.header = '5.6\nPro';
  let sent = 0;
  await assert.rejects(async () => { if (await checks.reviewModelActive(f.page, f.input, 'owned', 5000, request)) sent++; });
  assert.equal(sent, 0);
  assert.deepEqual(f.events, ['open', 'close', 'open', 'close']);
});

test('observed server Pro label requires fresh explicit 6 Pro proof and closes the menu', async () => {
  const f = strengthFixture({ english: true, closedLabel: 'Pro', status: null }), checks = activeChecks(f);
  assert.equal(await checks.reviewModelActive(f.page, f.input, 'owned', 5000, { model: 'chatgpt-web/6-pro' }), true);
  assert.deepEqual(f.events, ['open', 'close']);
  assert.equal(f.state.open, false);
  assert.equal(f.state.prompt, 'saved full prompt');
  assert.deepEqual(f.state.attachments, ['original.pdf']);
});

test('actual final submission guard verifies the server Pro label before continuing', async () => {
  const f = strengthFixture({ english: true, closedLabel: 'Pro', status: null }), checks = activeChecks(f);
  assert.equal(await checks.finalSubmissionCheck(), true);
  assert.deepEqual(f.events, ['open', 'close']);
  assert.equal(f.state.open, false);
});

for (const header of ['5.6 Pro', 'Pro']) test(`server Pro label does not authorize ${header} in the final guard`, async () => {
  const f = strengthFixture({ english: true, closedLabel: 'Pro', status: null, header }), checks = activeChecks(f);
  let submitted = 0;
  await assert.rejects(async () => { await checks.finalSubmissionCheck(); submitted++; }, /STRENGTH_HEADER_MISMATCH/);
  assert.equal(submitted, 0);
  assert.deepEqual(f.events, ['open', 'close']);
});

for (const status of [null, 'unrecognized localized announcement']) test(`English control does not require an invented English status parser: ${status}`, async () => {
  const f = strengthFixture({ english: true, status }), checks = activeChecks(f);
  await checks.selectReviewModelOnFreshPage(f.page, f.input, 'owned', 5000, { model: 'chatgpt-web/6-pro' });
  assert.deepEqual(f.events, ['open', 'close']);
});

test('waits for delayed header in the fresh owned strength popup', async () => {
  const f = strengthFixture({ delayedHeader: true }), checks = activeChecks(f);
  assert.equal(await checks.reviewModelActive(f.page, f.input, 'owned', 5000, { model: 'chatgpt-web/6-pro' }), true);
  assert.ok(f.state.ticks >= 3);
  assert.deepEqual(f.events, ['open', 'close']);
});

test('actual final submission guards reopen fresh proof and finish with popup closed', async () => {
  const f = strengthFixture(), checks = activeChecks(f);
  await checks.waitForComposer(f.page, 5000, { model: 'chatgpt-web/6-pro' }, 'owned');
  assert.equal(await checks.finalSubmissionCheck(), true);
  assert.deepEqual(f.events, ['open', 'close', 'open', 'close']);
  assert.equal(f.state.open, false);
});

for (const [change, mutate] of Object.entries({
  model: f => { f.state.header = '5.6 Pro'; },
  prompt: f => { f.state.onClose = () => { f.state.prompt = 'changed'; }; },
  attachment: f => { f.state.onClose = () => { f.state.attachments = []; }; },
})) test(`actual final submission guards stop changed ${change} with zero submit`, async () => {
  const f = strengthFixture(), checks = activeChecks(f); let submitted = 0;
  await checks.waitForComposer(f.page, 5000, { model: 'chatgpt-web/6-pro' }, 'owned');
  mutate(f);
  await assert.rejects(async () => { await checks.finalSubmissionCheck(); submitted++; },
    new RegExp(change === 'model' ? 'STRENGTH_HEADER_MISMATCH' : change === 'prompt' ? 'PROMPT_CHANGED' : 'ATTACHMENT_UPLOAD_NOT_CONFIRMED'));
  assert.equal(submitted, 0);
  assert.equal(f.state.open, false);
});

for (const [name, options] of Object.entries({
  '5.6 family': { header: '5.6 Pro' }, '5.5 family': { header: '5.5 Pro' },
  'Latest alone': { header: 'Latest' }, 'bare Pro': { header: 'Pro' },
  'ambiguous header': { headers: 2 }, 'missing header': { headers: 0 },
  'wrong status': { status: 'High，第 4 项，共 5 项。' },
  'wrong status index': { status: 'Pro，第 4 项，共 5 项。' }, 'absent intensity': { intensity: false },
  'lower intensity': { sliderNow: '3' }, 'wrong slider range': { sliderMax: '5' },
  'ambiguous slider': { sliderCount: 2 }, 'foreign slider': { foreignSlider: true },
  'disabled intensity ancestor': { intensityDisabled: true }, 'disabled model header': { headerDisabled: true },
  'inert ancestry on enabled intensity': { intensityAncestorBlocked: true },
  'inert ancestry on enabled header': { headerAncestorBlocked: true }, 'ambiguous status': { statusCount: 2 },
  'disabled control': { disabled: true }, 'popup never opens': { opens: false },
  'stale popup': { stale: true }, 'popup cannot close': { closes: false },
})) test(`observed strength popup rejects ${name} before send`, async () => {
  const f = strengthFixture(options), checks = activeChecks(f); let sent = 0;
  await assert.rejects(async () => {
    await checks.selectReviewModelOnFreshPage(f.page, f.input, 'owned', 5000, { model: 'chatgpt-web/6-pro' }); sent++;
  });
  assert.equal(sent, 0);
  assert.equal(f.state.prompt, 'saved full prompt');
  assert.deepEqual(f.state.attachments, ['original.pdf']);
});

test('preserves the direct 6 Pro radio path', async () => {
  const f = fixture({ direct: true });
  await selector()(f.page, f.input, 'owned', 2000, { model: 'chatgpt-web/6-pro' });
  assert.deepEqual(f.clicks, ['model', 'pro']);
});

test('uses confirmed Thinking effort then Power and verifies the final 6 Pro label', async () => {
  const f = fixture(); let send = 0;
  await selector()(f.page, f.input, 'owned', 2000, { model: 'chatgpt-web/6-pro' }); send++;
  assert.deepEqual(f.clicks, ['model', 'effort', 'power']); assert.equal(send, 1);
});

test('identifies a unique newly-opened popup without guessing the Power role', async () => {
  const f = fixture({ linked: false, foreignMenu: true });
  await selector()(f.page, f.input, 'owned', 2000, { model: 'chatgpt-web/6-pro' });
  assert.deepEqual(f.clicks, ['model', 'effort', 'power']);
});

for (const submenu of ['inline', 'portal', 'linked']) test(`waits for delayed Power in its owned ${submenu} picker`, async () => {
  const f = fixture({ delayedPower: true, submenu }); let send = 0;
  await selector(f.tick)(f.page, f.input, 'owned', 2000, { model: 'chatgpt-web/6-pro' }); send++;
  assert.deepEqual(f.clicks, ['model', 'effort', 'power']); assert.equal(send, 1);
});

for (const [name, options] of Object.entries({
  'absent Power': { power: 0 }, 'disabled Power': { disabled: true }, 'ambiguous Power': { power: 2 },
  'absent Thinking effort': { thinking: 0 }, 'ambiguous Thinking effort': { thinking: 2 },
  'wrong family': { family: '5.6 High' }, 'wrong selected model': { active: '5.6 Pro' },
  'foreign Power': { power: 0, foreignPower: true }, 'lost page ownership': { ownership: 'foreign' },
  'disabled Thinking effort': { effortDisabled: true }, 'pre-existing picker': { alreadyOpen: true },
  'unrelated existing popup': { linked: false, foreignMenu: true, opens: false },
  'ambiguous newly-opened popups': { linked: false, extraPopup: true },
  'disabled direct Pro': { direct: true, disabled: true }, 'ambiguous direct Pro': { direct: 2 },
  'wrong direct Pro result': { direct: true, active: '5.6 Pro' },
})) test(`fails closed with zero send for ${name}`, async () => {
  const f = fixture(options); let send = 0;
  await assert.rejects(async () => { await selector()(f.page, f.input, 'owned', 2000, { model: 'chatgpt-web/6-pro' }); send++; });
  assert.equal(send, 0); assert.ok(!f.clicks.includes('foreign-power'));
  if (name === 'wrong family') assert.ok(!f.clicks.includes('power'));
});
