/** The carrier is owned here; React owns only its portal children. */
export function createHermesStagePortal(ownerDocument: Document) {
  const container = ownerDocument.createElement('div');
  container.dataset.hermesPortalCarrier = 'true';
  container.style.display = 'contents';
  let disposed = false;

  return {
    container,
    moveTo(anchor: HTMLElement | null) {
      if (disposed) return;
      const target = anchor?.isConnected ? anchor : ownerDocument.body;
      // A move triggers the anchor observer too. Never append an unchanged host.
      if (container.parentNode !== target) target.appendChild(container);
    },
    dispose() {
      disposed = true;
      container.remove();
    },
  };
}

export interface HermesConversationPlacement {
  anchor: HTMLElement | null;
  size: number;
}

export function observeHermesConversationAnchor(
  ownerDocument: Document,
  onChange: (placement: HermesConversationPlacement) => void,
) {
  let active = true;
  let anchor: HTMLElement | null = null;
  let previous: HermesConversationPlacement | null = null;
  const sync = () => {
    if (!active) return;
    const next = ownerDocument.querySelector<HTMLElement>('[data-hermes-conversation-companion="true"]');
    if (next !== anchor) {
      resizeObserver.disconnect();
      anchor = next;
      if (anchor) resizeObserver.observe(anchor);
    }
    const size = anchor ? Math.min(360, anchor.clientWidth, anchor.clientHeight) : 0;
    if (previous?.anchor === anchor && previous.size === size) return;
    previous = { anchor, size };
    onChange(previous);
  };
  const resizeObserver = new ResizeObserver(sync);
  const mutationObserver = new MutationObserver(sync);
  mutationObserver.observe(ownerDocument.body, { childList: true, subtree: true });
  sync();
  return () => {
    active = false;
    mutationObserver.disconnect();
    resizeObserver.disconnect();
  };
}
