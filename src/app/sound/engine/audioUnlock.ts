/** The part of an `AudioContext` the unlock uses. */
export interface ResumableContext {
  readonly state: string;
  resume(): Promise<void>;
}

/**
 * A context made outside a user's gesture starts `suspended`, in WebKit and Chromium alike, and
 * only a gesture lets it run. Every context Atlas makes is handed to `resumeOnGesture`, and each
 * document Atlas renders in is watched for gestures (`watchForGesture`), so sound that was asked
 * for before the first tap plays from that tap on.
 */

/** Contexts not yet known to run. */
const waiting = new Set<ResumableContext>();
let gestureSeen = false;

/**
 * Events that count as a gesture. A touch counts only when it ends (`pointerup`, `touchend`); a
 * mouse press and a key count at once.
 */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

/** Asks `context` to run. Once it does it is left alone for good: whoever suspends it later means to. */
function resume(context: ResumableContext): void {
  context.resume().then(() => {
    if (context.state === 'running') waiting.delete(context);
  }, () => undefined);
}

function onGesture(): void {
  gestureSeen = true;
  for (const context of waiting) {
    // Running, or closed for good: nothing left to do for it.
    if (context.state === 'running' || context.state === 'closed') waiting.delete(context);
    else resume(context);
  }
}

/**
 * Brings `context` to run with the user's next gesture; at once where they already made one,
 * which is enough wherever one gesture frees the whole page.
 */
export function resumeOnGesture(context: ResumableContext): void {
  if (context.state === 'closed') return;
  waiting.add(context);
  if (gestureSeen && context.state !== 'running') resume(context);
}

/** Listens for gestures in `doc`; returns the function that stops it. */
export function watchForGesture(doc: Document): () => void {
  for (const type of GESTURES) doc.addEventListener(type, onGesture, { capture: true, passive: true });
  return () => {
    for (const type of GESTURES) doc.removeEventListener(type, onGesture, { capture: true });
  };
}

/** Forgets every context and gesture: the page's sound goes with its owner. */
export function resetAudioUnlock(): void {
  waiting.clear();
  gestureSeen = false;
}
