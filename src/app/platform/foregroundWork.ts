/** What of a document tells whether its window is seen. */
export type VisibilitySource = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/**
 * Tells `hold` whenever `doc`'s window goes out of sight (true) or comes back (false), and at once
 * where it is out of sight already. Returns the function that stops telling.
 */
export function holdWhileHidden(doc: VisibilitySource, hold: (held: boolean) => void): () => void {
  let held = false;
  const update = (): void => {
    const hidden = doc.visibilityState === 'hidden';
    if (hidden === held) return;
    held = hidden;
    hold(hidden);
  };
  update();
  doc.addEventListener('visibilitychange', update);
  return () => doc.removeEventListener('visibilitychange', update);
}

/** What of `navigator.storage` asks the system to keep this origin's storage. */
export interface PersistentStorage {
  persist?: () => Promise<boolean>;
}

/**
 * Asks the system once per device not to evict this origin's storage (the map tile cache, which
 * can be built again: the answer changes nothing, it only makes eviction less likely). `asked` and
 * `remember` read and set the device's own note that it was asked.
 */
export function askForPersistentStorage(storage: PersistentStorage | undefined, asked: () => boolean, remember: () => void): void {
  if (typeof storage?.persist !== 'function' || asked()) return;
  remember();
  storage.persist().catch(() => undefined);
}
