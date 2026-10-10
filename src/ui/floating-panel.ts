/** Place a fixed panel beside its trigger, keeping it within the viewport. */
export function placeFloatingPanel(element: HTMLElement, anchor: HTMLElement, preferBelow = true) {
  const rect = anchor.getBoundingClientRect(), box = element.getBoundingClientRect(), gap = 8;
  const belowFits = rect.bottom + gap + box.height <= innerHeight - gap;
  const aboveFits = rect.top >= box.height + gap;
  const below = preferBelow ? belowFits || !aboveFits : !aboveFits;
  element.style.left = `${Math.max(gap, Math.min(innerWidth - box.width - gap, rect.right - box.width))}px`;
  element.style.top = `${Math.max(gap, Math.min(innerHeight - box.height - gap,
    below ? rect.bottom + gap : rect.top - box.height - gap))}px`;
}

/** Shared disclosure lifecycle. Item navigation and nested help stay with the feature. */
export function createFloatingPanel(root: HTMLElement, trigger: HTMLButtonElement, panel: HTMLElement, hooks: {
  onOpen?(): void;
  onClose?(): void;
  onReposition?(): void;
  /** Return true when a nested element consumed Escape. */
  onEscape?(): boolean;
} = {}) {
  const abort = new AbortController(), { signal } = abort;
  function close(restoreFocus = false) {
    if (panel.hidden) return;
    hooks.onClose?.(); panel.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function reposition() {
    if (panel.hidden) return;
    hooks.onReposition?.(); placeFloatingPanel(panel, trigger);
  }
  trigger.addEventListener('click', () => {
    if (!panel.hidden) return close();
    panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    placeFloatingPanel(panel, trigger); hooks.onOpen?.();
  }, { signal });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target as Node)) close(); }, { signal });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    if (!hooks.onEscape?.()) close(true);
    event.preventDefault();
  }, { signal });
  root.addEventListener('focusout', event => {
    if (event.relatedTarget && !root.contains(event.relatedTarget as Node)) close();
  }, { signal });
  window.addEventListener('resize', reposition, { signal });
  window.addEventListener('scroll', reposition, { signal, capture: true });
  return { close, destroy() { abort.abort(); close(); } };
}
