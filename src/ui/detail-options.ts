import { createFloatingPanel, placeFloatingPanel } from './floating-panel';

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
  const disclosure = createFloatingPanel(root, trigger, panel, {
    onClose: hideHelp, onReposition: hideHelp,
    onEscape() { const consumed = !!activeHelp; hideHelp(); return consumed; },
  });
  root.querySelector<HTMLButtonElement>('[data-options-close]')!.addEventListener('click', () => disclosure.close(true), { signal });
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
  root.addEventListener('pointerdown', event => {
    if (!(event.target as Element).closest('[data-option-help], [role="tooltip"]')) hideHelp();
  }, { signal });
  return { destroy() { abort.abort(); disclosure.destroy(); } };
}
