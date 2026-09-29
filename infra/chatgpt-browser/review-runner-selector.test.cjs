const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Load the real, side-effect-free selector functions without the operator's CLI,
// browser connection, filesystem publication or installed server Playwright runtime.
const source = fs.readFileSync(require.resolve('./review-runner.cjs'), 'utf8');
function selector(onTick = () => {}) {
  let now = 0;
  const sandbox = { Date: { now: () => now }, setTimeout: fn => { now += 250; onTick(); fn(); } };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('function normalizeComposerText('), source.indexOf('async function normalChatMode(')), sandbox);
  return sandbox.selectReviewModelOnFreshPage;
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
  async getAttribute(name) { return name === 'aria-controls' ? this.nodes()[0]?.controls ?? null : name === 'aria-disabled' ? String(Boolean(this.nodes()[0]?.disabled)) : null; }
  async innerText() { const n = this.nodes()[0]; return n?.label ? n.label() : n?.name ?? ''; }
  async click() { assert.equal(await this.count(), 1); assert.equal(await this.isEnabled(), true); this.nodes()[0].click?.(); }
  async waitFor() { if (!await this.isVisible()) throw new Error('timeout'); }
  async evaluate(fn, arg) {
    const n = this.nodes()[0];
    if (Array.isArray(arg)) return arg.includes(n);
    return Boolean(n?.disabled);
  }
  async elementHandles() { return this.nodes(); }
  getByText(text, options) { return this.nodes()[0]?.getByText?.(text, options) ?? new Locator([]); }
}

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
