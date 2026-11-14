import { DRAW_TOOL_BARS } from './TypingWatch';

/** The class of the bar under a selection of drawings and texts on the map (`SelectionBar`). */
export const SELECTION_BAR = 'atlas-selection-bar';

/** A menu of the Draw tool's bars or of the bar under a selection that stands open: its button says so. */
const OPEN_MENU = `${DRAW_TOOL_BARS} [aria-expanded="true"], .${SELECTION_BAR} [aria-expanded="true"]`;

/**
 * Whether the press on the map that is being handled found a menu of the Draw tool's bars or of
 * the bar under a selection open (the colours, a size, the symbols). Such a press closes the menu
 * and does nothing else, as a press beside an open menu does anywhere: it draws no dot, places no
 * stamp, starts no path that then waits for its next click and lets go of nothing selected.
 *
 * A menu closes on the same press, some of them before the canvas hears it, so every press is
 * looked at as it comes in: in the capture phase, in the canvas's own document, by a listener
 * that is there before any menu opens (for as long as the map is).
 */
export class BarMenuPress {
  /** The document the presses are heard in; null while none are. */
  private heardIn: Document | null = null;
  private beside = false;

  constructor(private readonly canvas: () => HTMLElement) {}

  /** Whether the press now handled only closes a menu. */
  get closesMenu(): boolean {
    return this.heardIn !== null && this.beside;
  }

  /** Looks at the presses, or stops. */
  setEnabled(enabled: boolean): void {
    if (enabled === (this.heardIn !== null)) return;
    this.beside = false;
    this.heardIn?.removeEventListener('pointerdown', this.onPress, true);
    this.heardIn = enabled ? this.canvas().ownerDocument : null;
    this.heardIn?.addEventListener('pointerdown', this.onPress, true);
  }

  destroy(): void {
    this.setEnabled(false);
  }

  private readonly onPress = (event: PointerEvent): void => {
    const canvas = this.canvas();
    this.beside = event.target === canvas && canvas.ownerDocument.querySelector(OPEN_MENU) !== null;
  };
}
