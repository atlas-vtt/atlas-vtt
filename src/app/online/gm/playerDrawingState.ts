import { MAX_PLAYER_STROKE_POINTS, type PlayerDrawPoints } from '../protocol/index.ts';
import type { DrawingStroke } from '../../types';
import { drawPointsRate, pointsOf } from './drawCheck.ts';
import type { MoveRate } from './moveCheck.ts';

type Point = DrawingStroke['points'][number];

/** The ids one player names their own drawings and texts by: short, counted per player, and of no use to anyone else. */
interface Aliases {
  readonly byId: Map<string, string>;
  readonly byAlias: Map<string, string>;
  next: number;
}

/** The ids each player names their own drawings and texts by, handed out as they are first told. */
export class PlayerAliases {
  private readonly players = new Map<string, Aliases>();

  /** The id `player` names the scene's `id` by: the same each time. */
  of(player: string, id: string): string {
    let known = this.players.get(player);
    if (known === undefined) this.players.set(player, known = { byId: new Map(), byAlias: new Map(), next: 1 });
    let alias = known.byId.get(id);
    if (alias === undefined) {
      alias = (known.next++).toString(36);
      known.byId.set(id, alias);
      known.byAlias.set(alias, id);
    }
    return alias;
  }

  /** The scene's id `player` means by `alias`; none for one this player was never told. */
  idOf(player: string, alias: string): string | undefined {
    return this.players.get(player)?.byAlias.get(alias);
  }

  clear(): void {
    this.players.clear();
  }
}

/** Points of a long drawing sent ahead of its request. */
interface Ahead {
  readonly n: number;
  readonly points: Point[];
  /** A message of them was lost, came out of order or over the rate: the request they belong to is refused. */
  broken: boolean;
}

/** The points each player sent ahead of the request they are making: one request's at a time, within the rate of such messages. */
export class PointsAhead {
  private readonly players = new Map<string, Ahead>();
  private readonly rate: MoveRate = drawPointsRate();

  take(from: string, message: PlayerDrawPoints, now: number): void {
    let ahead = this.players.get(from);
    if (ahead === undefined || ahead.n !== message.n) {
      ahead = { n: message.n, points: [], broken: false };
      this.players.set(from, ahead);
    }
    const points = pointsOf(message.pts);
    if (ahead.broken || message.from !== ahead.points.length || ahead.points.length + points.length > MAX_PLAYER_STROKE_POINTS || !this.rate.take(from, now)) {
      ahead.broken = true;
      return;
    }
    ahead.points.push(...points);
  }

  /** The points of the request `n` with those sent ahead of it; null where some are missing or there are more than a drawing may have. */
  all(from: string, n: number, sentAhead: number | undefined, flat: readonly number[]): Point[] | null {
    const points = pointsOf(flat);
    if (sentAhead === undefined || sentAhead === 0) return points.length <= MAX_PLAYER_STROKE_POINTS ? points : null;
    const ahead = this.players.get(from);
    if (ahead === undefined || ahead.n !== n || ahead.broken || ahead.points.length !== sentAhead) return null;
    return ahead.points.length + points.length <= MAX_PLAYER_STROKE_POINTS ? [...ahead.points, ...points] : null;
  }

  /** The request `n` was dealt with: what was sent ahead of it goes. */
  done(from: string, n: number): void {
    if (this.players.get(from)?.n === n) this.players.delete(from);
  }

  playerLeft(player: string): void {
    this.players.delete(player);
  }

  clear(): void {
    this.players.clear();
  }
}
