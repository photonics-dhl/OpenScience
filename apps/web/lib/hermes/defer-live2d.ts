/** Defer optional animation until the page and visible UI have priority. */
export function deferVisibleLive2DStart(start: () => void, isVisible: () => boolean) {
  let stopped = false;
  let started = false;
  let cancelScheduled: (() => void) | undefined;
  const notify = () => {
    if (stopped || started || cancelScheduled || document.readyState !== 'complete' || !isVisible()) return;
    const run = () => {
      cancelScheduled = undefined;
      if (stopped || started || !isVisible()) return;
      started = true;
      start();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 2000 });
      cancelScheduled = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(run, 500);
      cancelScheduled = () => window.clearTimeout(id);
    }
  };
  window.addEventListener('load', notify);
  notify();
  return { notify, dispose() { stopped = true; cancelScheduled?.(); window.removeEventListener('load', notify); } };
}
