import { describe, expect, it, vi } from 'vitest';
import { keepScreenAwake, type WakeWindow } from '../../../src/app/tableMode/screenWake';

interface FakeWindow extends WakeWindow {
  requests: number;
  released: number;
  /** Shows or hides the page and tells its listeners. */
  show(visible: boolean): void;
}

function fakeWindow(refuses = false): FakeWindow {
  const listeners = new Set<() => void>();
  let visibility: DocumentVisibilityState = 'visible';
  const win: FakeWindow = {
    requests: 0,
    released: 0,
    navigator: {
      wakeLock: {
        request: async () => {
          win.requests++;
          if (refuses) throw new DOMException('Not allowed', 'NotAllowedError');
          return { release: async () => { win.released++; } } as WakeLockSentinel;
        },
      },
    },
    document: {
      get visibilityState() { return visibility; },
      addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
      removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
    } as WakeWindow['document'],
    show: (visible) => {
      visibility = visible ? 'visible' : 'hidden';
      listeners.forEach((listener) => listener());
    },
  };
  return win;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the screen while a tablet shows the table its map', () => {
  it('asks for a wake lock and lets it go at the end', async () => {
    const win = fakeWindow();
    const sleep = keepScreenAwake(win);
    await settle();
    expect(win.requests).toBe(1);
    expect(win.released).toBe(0);
    sleep();
    await settle();
    expect(win.released).toBe(1);
  });

  it('lets the lock go when the page hides and asks again when it shows', async () => {
    const win = fakeWindow();
    const sleep = keepScreenAwake(win);
    await settle();
    win.show(false);
    await settle();
    expect(win.released).toBe(1);
    win.show(true);
    await settle();
    expect(win.requests).toBe(2);
    sleep();
    await settle();
    expect(win.released).toBe(2);
    // Nothing is asked for once it is over
    win.show(false);
    win.show(true);
    await settle();
    expect(win.requests).toBe(2);
  });

  it('keeps no lock that arrives after the end', async () => {
    const win = fakeWindow();
    keepScreenAwake(win)();
    await settle();
    expect(win.requests).toBe(1);
    expect(win.released).toBe(1);
  });

  it('does nothing on a device without the lock, and a refusal is no error', async () => {
    const bare: WakeWindow = { navigator: {}, document: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() } };
    expect(() => keepScreenAwake(bare)()).not.toThrow();
    expect(bare.document.addEventListener).not.toHaveBeenCalled();

    const refusing = fakeWindow(true);
    const sleep = keepScreenAwake(refusing);
    await settle();
    expect(refusing.requests).toBe(1);
    sleep();
    expect(refusing.released).toBe(0);
  });
});
