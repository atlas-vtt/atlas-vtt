import type { EventSystem } from 'pixi.js';

/** The handlers PIXI's EventSystem binds to itself in its constructor, for the pointer moves and releases it hears. */
interface GlobalPointerHandlers {
  readonly _onPointerMove: (event: PointerEvent) => void;
  readonly _onPointerUp: (event: PointerEvent) => void;
}

/**
 * PIXI's EventSystem hears pointer moves on `globalThis.document` and releases on `globalThis`
 * (PixiJS 8.22, `_addEvents`), so a canvas in a popout window got its presses and nothing after
 * them: no drag, pan or stroke moved or ended. This moves those two listeners to `win`, the
 * canvas' own window, as PIXI adds them (capture phase), and puts them back on the main window
 * when stopped. The main window's moves would otherwise land on the popout's canvas at made-up
 * places (hover, cursor, previews).
 *
 * @returns Puts the listeners back on the main window, unless PIXI has removed its own since.
 */
export function bridgePopoutPointer(events: EventSystem, win: Window): () => void {
  const { _onPointerMove: move, _onPointerUp: up } = events as unknown as GlobalPointerHandlers;
  if (events.domElement) {
    window.document.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
  }
  win.document.addEventListener('pointermove', move, true);
  win.addEventListener('pointerup', up, true);
  return (): void => {
    win.document.removeEventListener('pointermove', move, true);
    win.removeEventListener('pointerup', up, true);
    // A destroyed EventSystem has no element and has let go of its listeners for good
    if (!events.domElement) return;
    window.document.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  };
}
