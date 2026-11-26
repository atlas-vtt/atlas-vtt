/** What of a window the wake lock needs; a test hands in its own. */
export interface WakeWindow {
  navigator: { wakeLock?: Pick<WakeLock, 'request'> };
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

/**
 * Keeps the screen on while a tablet shows the table its map (Screen Wake Lock API, where the
 * device has it). The browser takes the lock away when the page is hidden, so it is asked for
 * again once the page shows. A device that refuses, or has no such lock, dims as it always did.
 * Returns what lets the screen sleep again.
 */
export function keepScreenAwake(win: WakeWindow): () => void {
  const wakeLock = win.navigator.wakeLock;
  if (!wakeLock) return () => undefined;
  let held: WakeLockSentinel | null = null;
  let wanted = true;

  const release = (): void => {
    const sentinel = held;
    held = null;
    if (sentinel) void sentinel.release().catch(() => undefined);
  };
  const request = (): void => {
    if (held || win.document.visibilityState !== 'visible') return;
    void wakeLock.request('screen').then((sentinel) => {
      // Asked for twice in a row, or let go meanwhile: only one lock is kept, and none after the end
      if (!wanted || held || win.document.visibilityState !== 'visible') {
        void sentinel.release().catch(() => undefined);
        return;
      }
      held = sentinel;
    }).catch(() => undefined);
  };
  const follow = (): void => {
    if (win.document.visibilityState === 'visible') request();
    else release();
  };

  win.document.addEventListener('visibilitychange', follow);
  request();
  return () => {
    wanted = false;
    win.document.removeEventListener('visibilitychange', follow);
    release();
  };
}
