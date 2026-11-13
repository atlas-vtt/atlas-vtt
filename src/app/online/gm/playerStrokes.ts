import type { PlayerStroke, SharedStroke } from '../protocol/index.ts';
import type { LiveDrawing } from '../../annotations/madeDrawing';
import type { DrawingUnderWay } from '../../annotations/underWay';
import type { FogCoverage } from '../../fog/fogCoverage';
import { allNearEdge, playerDrawing, pointsOf } from './drawCheck.ts';
import { GmStrokes, STROKE_KEPT_MS } from './gmStrokes.ts';
import type { MapSize } from './moveCheck.ts';

type Point = LiveDrawing['points'][number];

/** The most points of a pen's stroke a player is making that are followed while it grows: a longer one stands still at its end until it is made. */
export const MAX_LIVE_PEN_POINTS = 4_096;

interface Held {
  /** The number of the request that makes the drawing. */
  readonly n: number;
  /** The pen's points told so far, and how many the sender's stroke has come to. */
  readonly points: Point[];
  count: number;
  under: DrawingUnderWay | null;
  /** When the drawing was made; null while it is not. */
  madeAt: number | null;
  readonly told: GmStrokes;
}

/**
 * The drawings players are making, as everyone else is shown them while they grow. A player's
 * page tells what its gesture has made so far and the look it will have; the drawing is made of
 * that here as a finished one is (`playerDrawing`), and told on by the rule the GM's own drawing
 * under way is told by (`GmStrokes`): never one committed fog covers whole. It is presence alone:
 * nothing of it is written anywhere, and it goes when its sender drops it, leaves, or the drawing
 * is made (told as `kept` for a moment, so no page shows a gap before the drawing itself arrives).
 */
export class PlayerStrokes {
  private readonly held = new Map<string, Held>();
  /** What numbers each player's drawings for those who are shown them: one for as long as the player is here, so no two of their drawings share a number. */
  private readonly tellers = new Map<string, GmStrokes>();

  /** A player's drawing under way as their page tells it; one that lies off the map is not followed. */
  receive(from: string, message: PlayerStroke, cell: number, map: MapSize | null, now: number): void {
    if (message.mode === null || message.look === undefined) {
      this.held.delete(from);
      return;
    }
    let held = this.held.get(from);
    if (held === undefined || held.n !== message.n || held.madeAt !== null) {
      let told = this.tellers.get(from);
      if (told === undefined) this.tellers.set(from, told = new GmStrokes());
      held = { n: message.n, points: [], count: 0, under: null, madeAt: null, told };
      this.held.set(from, held);
    }
    const sent = pointsOf(message.pts);
    if (!allNearEdge(sent, map, cell)) {
      held.under = null;
      return;
    }
    const pen = message.mode === 'pen';
    let points: readonly Point[] = sent;
    if (pen) {
      const before = message.from ?? 0;
      // What a message tells again is left out; a stroke that lost a message goes straight on to what came.
      const fresh = sent.slice(Math.max(0, held.count - before));
      const grew = fresh.length > 0 && held.points.length < MAX_LIVE_PEN_POINTS;
      if (grew) held.points.push(...fresh.slice(0, MAX_LIVE_PEN_POINTS - held.points.length));
      held.count = Math.max(held.count, before + sent.length);
      if (grew) held.told.moved(now);
      points = held.points;
    }
    const drawing = playerDrawing(message.mode, points, message.closed === true, message.look, cell);
    held.under = drawing === null ? null : { serial: message.n, drawings: [drawing], pen, made: false };
  }

  /** The request `n` of a player was dealt with: the drawing they were making is on the map now, or is not. */
  ended(player: string, n: number, made: boolean, now: number): void {
    const held = this.held.get(player);
    if (held === undefined || held.n !== n) return;
    if (!made) {
      this.held.delete(player);
      return;
    }
    held.madeAt = now;
    held.under = { serial: n, drawings: [], pen: false, made: true };
  }

  /** What the `marks` message sent at `now` tells of the players' drawings under way. */
  take(fog: FogCoverage | null, now: number): SharedStroke[] {
    const strokes: SharedStroke[] = [];
    for (const [who, held] of this.held) {
      if (held.madeAt !== null && now - held.madeAt >= STROKE_KEPT_MS) {
        this.held.delete(who);
        continue;
      }
      const stroke = held.told.take(held.under, fog, now);
      if (stroke !== undefined) strokes.push({ who, ...stroke });
    }
    return strokes;
  }

  /** Whether anyone is drawing, or a drawing just made is still told of. */
  get any(): boolean {
    return this.held.size > 0;
  }

  playerLeft(player: string): boolean {
    this.tellers.delete(player);
    return this.held.delete(player);
  }

  reset(): void {
    this.held.clear();
    this.tellers.clear();
  }
}
