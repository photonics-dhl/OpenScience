import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHermesStagePortal, observeHermesConversationAnchor } from '../lib/hermes/stage-portal';

// Only the DOM ownership/observation boundary is simulated. Browser coverage
// checks the real React stage and canvas identities across these same moves.
class TestNode {
  parentNode: TestNode | null = null;
  children: TestNode[] = [];
  dataset: Record<string, string> = {};
  style = { display: '' };
  clientWidth = 360;
  clientHeight = 360;
  constructor(private root = false) {}
  get isConnected(): boolean { return this.root || Boolean(this.parentNode?.isConnected); }
  appendChild(node: TestNode) {
    node.remove();
    this.children.push(node);
    node.parentNode = this;
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  get element() { return this as unknown as HTMLElement; }
}

function setup() {
  const body = new TestNode(true);
  const page = body.appendChild(new TestNode());
  const conversation = body.appendChild(new TestNode());
  const query = vi.fn<() => HTMLElement | null>(() => null);
  const document = {
    body: body.element,
    createElement: vi.fn(() => new TestNode().element),
    querySelector: query,
  } as unknown as Document;
  return { body, conversation, document, page, query };
}

afterEach(() => vi.unstubAllGlobals());

describe('Hermes portal ownership', () => {
  it('moves one carrier with its existing children between page, conversation and fallback', () => {
    const { body, conversation, document, page } = setup();
    const portal = createHermesStagePortal(document);
    const carrier = portal.container as unknown as TestNode;
    const canvas = carrier.appendChild(new TestNode());
    for (const target of [page, conversation, page]) {
      portal.moveTo(target.element);
      expect(carrier.parentNode).toBe(target);
      expect(carrier.children).toEqual([canvas]);
      expect(canvas.isConnected).toBe(true);
    }
    page.remove();
    portal.moveTo(page.element);
    expect(carrier.parentNode).toBe(body);
    expect(carrier.children[0]).toBe(canvas);
    expect(document.createElement).toHaveBeenCalledTimes(1);
  });

  it('does not move an unchanged host again or resurrect a disposed carrier', () => {
    const { body, document, page } = setup();
    const append = vi.spyOn(page, 'appendChild');
    const portal = createHermesStagePortal(document);
    portal.moveTo(page.element);
    portal.moveTo(page.element);
    expect(append).toHaveBeenCalledTimes(1);
    portal.dispose();
    portal.dispose();
    portal.moveTo(null);
    expect(portal.container.isConnected).toBe(false);
    expect(body.children).not.toContain(portal.container);
    const replacement = createHermesStagePortal(document);
    replacement.moveTo(page.element);
    expect(page.children).toEqual([replacement.container]);
    replacement.dispose();
    expect(page.children).toEqual([]);
  });
});

describe('conversation geometry lifetime', () => {
  function observers() {
    const observers: Array<{ notify: () => void; disconnect: ReturnType<typeof vi.fn>; observe: ReturnType<typeof vi.fn> }> = [];
    class Observer {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(public notify: () => void) { observers.push(this); }
    }
    vi.stubGlobal('ResizeObserver', Observer);
    vi.stubGlobal('MutationObserver', Observer);
    return observers;
  }

  it('tracks late anchors and resize without publishing unchanged mutation/resize cycles', () => {
    const { conversation, document, query } = setup();
    const observed = observers();
    const changed = vi.fn();
    const stop = observeHermesConversationAnchor(document, changed);
    const [resize, mutation] = observed;
    expect(changed).toHaveBeenLastCalledWith({ anchor: null, size: 0 });
    query.mockReturnValue(conversation.element);
    mutation.notify();
    expect(changed).toHaveBeenLastCalledWith({ anchor: conversation.element, size: 360 });
    expect(resize.observe).toHaveBeenCalledWith(conversation.element);
    mutation.notify();
    resize.notify();
    expect(changed).toHaveBeenCalledTimes(2);
    conversation.clientWidth = 240;
    resize.notify();
    expect(changed).toHaveBeenLastCalledWith({ anchor: conversation.element, size: 240 });
    conversation.clientHeight = 180;
    resize.notify();
    expect(changed).toHaveBeenLastCalledWith({ anchor: conversation.element, size: 180 });
    stop();
  });

  it('releases old route anchors and ignores observer deliveries after cleanup', () => {
    const { conversation, document, page, query } = setup();
    const observed = observers();
    const changed = vi.fn();
    query.mockReturnValue(conversation.element);
    const stop = observeHermesConversationAnchor(document, changed);
    const [resize, mutation] = observed;
    const disconnects = resize.disconnect.mock.calls.length;
    query.mockReturnValue(page.element);
    mutation.notify();
    expect(resize.disconnect).toHaveBeenCalledTimes(disconnects + 1);
    expect(resize.observe).toHaveBeenLastCalledWith(page.element);
    query.mockReturnValue(null);
    mutation.notify();
    expect(changed).toHaveBeenLastCalledWith({ anchor: null, size: 0 });
    stop();
    expect(mutation.disconnect).toHaveBeenCalledOnce();
    changed.mockClear();
    query.mockReturnValue(conversation.element);
    resize.notify();
    mutation.notify();
    expect(changed).not.toHaveBeenCalled();
  });
});
