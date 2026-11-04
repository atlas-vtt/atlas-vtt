import { CURSOR_REST_MS, GM_MARKS, MAX_LASER_SPAN_MS, MAX_MARK_CURSOR_NUMBERS, type CursorState, type PlayerCursor, type SharedCursor } from '../protocol/index.ts';
import type { CursorSource } from '../marks/index.ts';
import { checkCursor, markRate, type MarkContext } from './markCheck.ts';
import type { MoveRate } from './moveCheck.ts';

export interface CursorSharePorts {
  now(): number;
  /** Whether the GM lets everyone see each other's cursor (the player view's setting). */
  shown(): boolean;
  /** The name a player goes by at the table, or null when it is not known. */
  nameOf(player: string): string | null;
  /** Whether someone's laser shows its pointer now: their cursor gives way to it. */
  pointing(who: string): boolean;
  /** Draws the players' cursors for the GM, called as each arrives; only the one that just arrived has new places. */
  showPlayerCursors?(cursors: readonly SharedCursor[]): void;
}

interface PlayerCursorState {
  at: CursorState['at'];
  /** The places that came since the last `marks` message and the time they cover: null when a message of them told none. */
  waiting: { readonly pts: number[]; readonly span: number | null } | null;
  /** When its last message came, on the share's clock: a page sends one only while its owner moves the pointer or the map. */
  movedAt: number;
}

/** The time messages cover together: null once one of them told none, and no more than a message may tell. */
const spansAdded = (covered: number | null, span: number | undefined): number | null => (covered === null || span === undefined ? null : Math.min(MAX_LASER_SPAN_MS, covered + span));

const entry = (who: string, name: string | null, at: CursorState['at'], pts: readonly number[], span: number | null): SharedCursor => ({ who, ...(name !== null && { name }), at, pts, ...(span !== null && { span }) });

/**
 * Everyone's cursors in the shared scene while the GM lets everyone see them: each player's checked
 * cursor and the GM's own, for `MarkShare` to send with the marks. A cursor is left out while it is
 * off the map, at rest for `CURSOR_REST_MS`, or while its owner points with the laser. With the
 * setting off nothing is taken and nothing goes out.
 */
export class CursorShare {
  private readonly ports: CursorSharePorts;
  private readonly cursors = new Map<string, PlayerCursorState>();
  private readonly rate: MoveRate = markRate();
  /** Whether the GM's own cursor went out with the last `marks` message. */
  private gmShown = false;

  constructor(ports: CursorSharePorts) {
    this.ports = ports;
  }

  /** A player's cursor: checked, then kept until it leaves, rests or the player goes; true when it was taken. */
  receive(from: string, message: PlayerCursor, context: MarkContext): boolean {
    if (!this.ports.shown()) return false;
    const now = this.ports.now();
    const state = this.rate.take(from, now) ? checkCursor(message, context) : null;
    if (state === null) return false;
    const held = this.cursors.get(from);
    const waiting = held?.waiting ?? { pts: [], span: 0 };
    const pts = [...waiting.pts, ...state.pts].slice(-MAX_MARK_CURSOR_NUMBERS);
    this.cursors.set(from, { at: state.at, waiting: { pts, span: spansAdded(waiting.span, state.span) }, movedAt: now });
    this.show(from, state);
    return true;
  }

  /** A player left: their cursor goes; true when they had one. */
  playerLeft(player: string): boolean {
    const had = this.cursors.delete(player);
    if (had) this.show();
    return had;
  }

  /** Another scene, or the setting switched off: every cursor goes. */
  reset(): void {
    this.cursors.clear();
    this.show();
  }

  /**
   * Looks again: the setting may be off now, and cursors may have come to rest. The GM's overlay is
   * shown them as they are, also when nothing changed: it may have been cleared meanwhile (the GM
   * worked on another scene tab).
   */
  update(): void {
    if (this.ports.shown()) return this.show();
    if (this.cursors.size > 0) this.reset();
  }

  /**
   * The cursors to send with the next `marks` message, with the places that came since the last; none
   * while the setting is off. `gm` is the GM's own cursor on the shared tab, null while there is none.
   */
  take(gm: CursorSource | null): SharedCursor[] | undefined {
    const trail = gm?.take(MAX_MARK_CURSOR_NUMBERS);
    const gmWasShown = this.gmShown;
    this.gmShown = false;
    if (!this.ports.shown()) return undefined;
    const now = this.ports.now();
    const shown: SharedCursor[] = [];
    const gmAt = gm?.at() ?? null;
    const gmMoved = gm?.movedAt() ?? null;
    const gmPts = trail?.pts ?? [];
    this.gmShown = gmAt !== null && gmMoved !== null && this.shows(GM_MARKS, gmMoved, now);
    // A cursor that just left the map goes once more without a place, with the way it took to the edge.
    if (this.gmShown || (gmWasShown && gmAt === null && gmPts.length > 0)) shown.push(entry(GM_MARKS, null, gmAt, gmPts, trail?.span ?? null));
    for (const [who, cursor] of this.cursors) {
      const { waiting } = cursor;
      cursor.waiting = null;
      if (!this.shows(who, cursor.movedAt, now) || (cursor.at === null && (waiting?.pts.length ?? 0) === 0)) continue;
      shown.push(entry(who, this.ports.nameOf(who), cursor.at, waiting?.pts ?? [], waiting?.span ?? null));
    }
    return shown;
  }

  /** Whether a cursor that last moved at `movedAt` is shown at `now`. */
  private shows(who: string, movedAt: number, now: number): boolean {
    return now - movedAt < CURSOR_REST_MS && !this.ports.pointing(who);
  }

  /**
   * Shows the GM every player's cursor as it is now. `arrived` is the player whose message just came:
   * only theirs carries its new places and span, since the overlay adds each to what it has; one that
   * just left the map comes with the way it took to the edge.
   */
  private show(arrived?: string, state?: CursorState): void {
    if (this.ports.showPlayerCursors === undefined) return;
    const now = this.ports.now();
    const leaving = (who: string): boolean => who === arrived && (state?.pts.length ?? 0) > 0;
    const shown = [...this.cursors].filter(([who, cursor]) => (cursor.at !== null || leaving(who)) && this.shows(who, cursor.movedAt, now));
    this.ports.showPlayerCursors(shown.map(([who, cursor]) => (who === arrived && state !== undefined
      ? entry(who, this.ports.nameOf(who), cursor.at, state.pts, state.span ?? null)
      : entry(who, this.ports.nameOf(who), cursor.at, [], null))));
  }
}
