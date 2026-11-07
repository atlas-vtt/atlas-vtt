/** How long a job may run before the browser gets a turn: half a frame at 60 Hz, so a frame is rarely missed. */
export const WORK_SLICE_MS = 8;

interface YieldingScheduler {
  yield?: () => Promise<void>;
}

/**
 * Resolves once the browser has had a turn to handle input and paint. Uses
 * `scheduler.yield` where the runtime has it (the job then continues ahead of
 * other queued tasks) and a timer elsewhere. Both are the main window's, never
 * `activeWindow`'s: a popout that closes drops its pending timers, and the job
 * would wait forever.
 */
function yieldToMain(): Promise<void> {
  const scheduler = (window as { scheduler?: YieldingScheduler }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => { window.setTimeout(resolve, 0); });
}

/**
 * Paces a long job on the main thread. Await the returned function between the
 * job's units: it resolves at once while the current slice has time left, and
 * after the browser had a turn once `sliceMs` of work have passed.
 *
 * A loop that only awaits work that is already done (cached reads, values held
 * in memory) continues in microtasks, which run before the browser may paint or
 * take input: thousands of such units freeze the window, however small each is.
 */
export function workSlices(sliceMs = WORK_SLICE_MS): () => Promise<void> | undefined {
  let sliceStart = performance.now();
  return () => {
    if (performance.now() - sliceStart < sliceMs) return undefined;
    return yieldToMain().then(() => { sliceStart = performance.now(); });
  };
}
