import { describe, expect, it, vi } from 'vitest';
import { askForPersistentStorage, holdWhileHidden, type VisibilitySource } from '../../../src/app/platform/foregroundWork';

/** A document whose window a test hides and shows. */
function fakeDocument(state: DocumentVisibilityState): VisibilitySource & { show(next: DocumentVisibilityState): void; listeners: number } {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: state,
    addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
    show(next: DocumentVisibilityState): void {
      doc.visibilityState = next;
      for (const listener of [...listeners]) listener();
    },
    get listeners(): number { return listeners.size; },
  };
  return doc as unknown as VisibilitySource & { show(next: DocumentVisibilityState): void; listeners: number };
}

describe('work that waits while the window is out of sight', () => {
  it('is held when the window hides and let go when it shows, once each', () => {
    const doc = fakeDocument('visible');
    const hold = vi.fn();
    holdWhileHidden(doc, hold);

    expect(hold).not.toHaveBeenCalled();
    doc.show('hidden');
    doc.show('hidden');
    doc.show('visible');
    doc.show('visible');

    expect(hold.mock.calls).toEqual([[true], [false]]);
  });

  it('is held at once where the window is out of sight already', () => {
    const hold = vi.fn();
    holdWhileHidden(fakeDocument('hidden'), hold);

    expect(hold.mock.calls).toEqual([[true]]);
  });

  it('is no longer told once the watch is stopped', () => {
    const doc = fakeDocument('visible');
    const hold = vi.fn();
    const stop = holdWhileHidden(doc, hold);

    stop();
    doc.show('hidden');

    expect(doc.listeners).toBe(0);
    expect(hold).not.toHaveBeenCalled();
  });
});

describe('asking the system to keep the storage', () => {
  it('asks once per device and ignores the answer', async () => {
    let asked = false;
    const persist = vi.fn(async () => { throw new Error('denied'); });
    const ask = (): void => askForPersistentStorage({ persist }, () => asked, () => { asked = true; });

    ask();
    ask();
    await Promise.resolve();

    expect(persist).toHaveBeenCalledOnce();
  });

  it.each([undefined, {}])('does nothing where the web view cannot be asked (%j)', (storage) => {
    const remember = vi.fn();

    askForPersistentStorage(storage, () => false, remember);

    expect(remember).not.toHaveBeenCalled();
  });
});
