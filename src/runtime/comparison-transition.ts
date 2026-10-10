/** View-only timeline, independent of simulation time, DOM, and the selected engine. */
export function createComparisonTransition() {
  let target = 0, progress = 0, guides = 0, lastTime: number | null = null;
  return {
    setOpen(open: boolean, now: number) { target = open ? 1 : 0; lastTime = now; },
    suspend() { lastTime = null; },
    step(now: number, reducedMotion: boolean) {
      const delta = lastTime === null ? 0 : Math.max(0, now - lastTime);
      const pathsChanging = progress !== target;
      const previousGuides = guides;
      if (reducedMotion) progress = target;
      else if (pathsChanging && (target === 1 || guides === 0)) {
        progress = target > progress ? Math.min(1, progress + delta / 1400) : Math.max(0, progress - delta / 1100);
      }
      const guideTarget = target === 1 && progress === 1 ? 1 : 0;
      if (reducedMotion) guides = guideTarget;
      else guides = guideTarget > guides ? Math.min(1, guides + delta / 320) : Math.max(0, guides - delta / 180);
      const active = progress !== target || guides !== guideTarget;
      lastTime = active ? now : null;
      return {
        progress: progress ** 3 * (progress * (progress * 6 - 15) + 10),
        guideOpacity: guides * guides * (3 - 2 * guides),
        visible: target === 1 || progress > 0,
        pathsChanging,
        changed: pathsChanging || guides !== previousGuides,
        active,
      };
    },
  };
}
