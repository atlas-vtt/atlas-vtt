import { MIN_CARD_WIDTH } from '../../protocol/index.ts';
import { paneCardWidth } from '../../../statblocks/editor/note-panel/paneCardWidth';

/** How long the GM's panel must keep a width that changes the players' cards before their statblocks are drawn at it. */
export const PANEL_SETTLE_MS = 2_000;

/**
 * The width of the card a player's page draws in a panel this wide: the page lays every statblock
 * out in one column (`columnCard` on the page), as the panel lays out a card of one column.
 */
export const pageCardWidth = (panelWidth: number): number => Math.max(MIN_CARD_WIDTH, paneCardWidth(panelWidth, 1));

/**
 * The GM's panel width the players' statblocks are drawn at: the first one read, and then another
 * only once the card it gives the pages has held for `PANEL_SETTLE_MS`. A panel dragged wider, a
 * sidebar shown for a moment, or a width that changes nothing on the pages draws nothing anew.
 */
export class SettledPanelWidth {
  private current: number | undefined;
  /** A width whose card differs from the current one's, and since when its card has held. */
  private next: { readonly card: number; readonly since: number } | null = null;

  constructor(private readonly read: () => number | undefined, private readonly now: () => number) {}

  get(): number | undefined {
    const width = this.read();
    if (width === undefined || !Number.isFinite(width)) return this.current;
    if (this.current === undefined) {
      this.current = width;
      return width;
    }
    const card = pageCardWidth(width);
    if (card === pageCardWidth(this.current)) {
      this.next = null;
      return this.current;
    }
    const now = this.now();
    if (this.next?.card !== card) this.next = { card, since: now };
    if (now - this.next.since >= PANEL_SETTLE_MS) {
      this.current = width;
      this.next = null;
    }
    return this.current;
  }
}
