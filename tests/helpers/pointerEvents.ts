import { vi } from 'vitest';

/** What a test says about a pointer event; the rest is a mouse event's. */
export interface PointerInit extends MouseEventInit {
  pointerId?: number;
  pointerType?: 'mouse' | 'touch' | 'pen';
}

/**
 * jsdom has no `PointerEvent` and no pointer capture: for a test's length, a mouse event that
 * carries the pointer's id and kind, and elements that remember which pointers they hold. Call it
 * in `beforeEach`; `vi.unstubAllGlobals()` and `vi.restoreAllMocks()` take it away again.
 */
export function installPointerEvents(): void {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  });
  const held = new WeakMap<Element, Set<number>>();
  const proto = HTMLElement.prototype as HTMLElement & { setPointerCapture?: unknown };
  if (!('setPointerCapture' in proto)) {
    Object.assign(proto, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined, hasPointerCapture: () => false });
  }
  vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(function (this: HTMLElement, id: number) {
    held.set(this, (held.get(this) ?? new Set()).add(id));
  });
  vi.spyOn(HTMLElement.prototype, 'releasePointerCapture').mockImplementation(function (this: HTMLElement, id: number) {
    held.get(this)?.delete(id);
  });
  vi.spyOn(HTMLElement.prototype, 'hasPointerCapture').mockImplementation(function (this: HTMLElement, id: number) {
    return held.get(this)?.has(id) ?? false;
  });
}

/** A pointer event of `type`, which bubbles like a real one. */
export function pointerEvent(type: string, init: PointerInit = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init } as PointerEventInit);
}
