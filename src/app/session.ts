/** App-owned resources and a bounded, in-memory diagnostic record. */
export function createAppSession() {
  const cleanups: (() => void)[] = [];
  const events: { time: string; event: string; error?: { name: string; message: string; stack?: string } }[] = [];
  let describe = (): unknown => undefined;
  let disposed = false;
  function record(event: string, error?: unknown) {
    events.push({ time: new Date().toISOString(), event, error: error === undefined ? undefined : {
      name: error instanceof Error ? error.name : 'Error',
      message: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
      stack: error instanceof Error ? error.stack?.slice(0, 6000) : undefined,
    } });
    if (events.length > 30) events.shift();
  }
  return {
    record,
    onDispose(cleanup: () => void) { cleanups.push(cleanup); },
    describeWith(read: () => unknown) { describe = read; },
    snapshot() {
      try { return describe(); }
      catch (error) { record('diagnostic-snapshot-failed', error); return undefined; }
    },
    events: () => [...events],
    dispose() {
      if (disposed) return;
      disposed = true;
      // Release every owner even when one cleanup fails; also covers partial startup.
      for (const cleanup of cleanups.reverse()) {
        try { cleanup(); }
        catch (error) { record('cleanup-failed', error); }
      }
      cleanups.length = 0;
    },
  };
}

export type AppSession = ReturnType<typeof createAppSession>;
