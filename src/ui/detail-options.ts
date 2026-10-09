import { placeFloatingPanel } from './floating-panel';

/** One home for supplementary controls; behavior and physics remain in the app. */
export function createDetailOptions(root: HTMLElement) {
  const trigger = root.querySelector<HTMLButtonElement>('#detail-options-toggle')!;
  const panel = root.querySelector<HTMLElement>('#detail-options-panel')!;
  const abort = new AbortController(), { signal } = abort;
  let activeHelp: HTMLButtonElement | undefined;
  function hideHelp() {
    if (!activeHelp) return;
    document.getElementById(activeHelp.getAttribute('aria-describedby')!)!.hidden = true;
    activeHelp.setAttribute('aria-expanded', 'false'); activeHelp = undefined;
  }
  function setOpen(open: boolean, restoreFocus = false) {
    hideHelp(); panel.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
    if (open) placeFloatingPanel(panel, trigger);
    else if (restoreFocus) trigger.focus();
  }
  trigger.addEventListener('click', () => setOpen(panel.hidden), { signal });
  root.querySelector<HTMLButtonElement>('[data-options-close]')!.addEventListener('click', () => setOpen(false, true), { signal });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-option-help]')) {
    const show = () => {
      hideHelp(); activeHelp = button;
      const bubble = document.getElementById(button.getAttribute('aria-describedby')!)!;
      bubble.hidden = false; button.setAttribute('aria-expanded', 'true'); placeFloatingPanel(bubble, button, false);
    };
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') show(); }, { signal });
    button.addEventListener('pointerleave', () => { if (document.activeElement !== button) hideHelp(); }, { signal });
    button.addEventListener('focus', show, { signal });
    button.addEventListener('blur', hideHelp, { signal });
    // Click also works on touch devices, without depending on hover.
    button.addEventListener('click', show, { signal });
  }
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target as Node)) setOpen(false);
    else if (!(event.target as Element).closest('[data-option-help], [role="tooltip"]')) hideHelp();
  }, { signal });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    if (activeHelp) hideHelp(); else setOpen(false, true);
    event.preventDefault();
  }, { signal });
  root.addEventListener('focusout', event => {
    if (event.relatedTarget && !root.contains(event.relatedTarget as Node)) setOpen(false);
  }, { signal });
  window.addEventListener('resize', () => { if (!panel.hidden) { hideHelp(); placeFloatingPanel(panel, trigger); } }, { signal });
  window.addEventListener('scroll', () => { if (!panel.hidden) { hideHelp(); placeFloatingPanel(panel, trigger); } }, { signal, capture: true });
  return { destroy() { abort.abort(); } };
}
