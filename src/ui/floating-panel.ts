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
