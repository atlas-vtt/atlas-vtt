import type { GmMessage } from '../protocol/index.ts';
import type { SceneState } from './atlasView.ts';
import type { PageCovers } from './coveredPages.ts';
import { FloorRoutes } from './floorRoutes.ts';
import { playerFloors, type Floor, type FloorInputs } from './playerFloors.ts';

export interface SceneRoutesPorts {
  send(body: GmMessage, to?: string): void;
  /** The live lane, where there is one: a newer message under the same key takes the place of one not sent yet. */
  sendLive?(body: GmMessage, key: string, to?: string): void;
  /** Whether the scene has several floors now. */
  split(): boolean;
  /** The players connected now. */
  onlinePlayers(): readonly string[];
  /** Whether every player sees the party's picture by the GM's choice (`AtlasInputs.sharedVision`). */
  sharedVision(): boolean;
  /** The pages live marks leave out; without it, none. */
  readonly covers?: PageCovers | undefined;
}

/** What placing the players on their floors worked out: where each stands now and where each stood before. */
export interface FloorPlacement {
  readonly floors: ReadonlyMap<string, Floor>;
  readonly before: ReadonlyMap<string, Floor>;
}

/**
 * Who hears each message of the shared scene, decided in one place. It places each player on the floor
 * they stand on (`playerFloors`), and each floor places its players behind the eyes they see it through
 * (`FloorRoutes`); a player about to be sent their floor is placed first, never by a read. A message goes
 * to its addressee where it is theirs, and a message to all to everyone it is for: in one message to all
 * only where every page may hear it, one not placed yet too, so where everyone of the scene stands on the
 * presented floor and, for a picture, where everyone shares the party's. Live marks leave out the pages
 * whose book covers their map.
 */
export class SceneRoutes {
  private placed = new Map<string, Floor>();
  /** Whether every player who owns a token of the scene, connected or not, stands on the presented floor. */
  private together = true;
  private presented: Floor = null;
  /** What the floors were last worked out from: they are worked out again only when one of these changed. */
  private placedBy: readonly unknown[] = [];

  constructor(readonly ports: SceneRoutesPorts) {}

  /**
   * Places every connected player, and `joining` (players about to be sent their floor), on the floor they
   * stand on, where anything that decides it changed since the last time or `force` asks; the floors then
   * and before, or null where nothing was placed.
   */
  placeFloors(inputs: FloorInputs & { readonly state: Pick<SceneState, 'background'> }, joining: readonly string[], force: boolean): FloorPlacement | null {
    const players = [...new Set([...this.ports.onlinePlayers(), ...joining])];
    const { state, presented, acting } = inputs;
    const by = [state.objects.tokens, state.levels, state.background, presented, players.join('\n'), [...acting].join('\n')];
    if (!force && joining.length === 0 && by.every((input, index) => input === this.placedBy[index])) return null;
    this.placedBy = by;
    const { floors, together } = playerFloors(inputs, players);
    const before = this.placed;
    this.placed = new Map(floors);
    this.together = together;
    this.presented = presented;
    return { floors, before };
  }

  /** Whether a player's floor is known. */
  isPlaced(player: string): boolean {
    return this.placed.has(player);
  }

  /** A player's floor, the presented one while theirs is not known. */
  floorOf(player: string): Floor {
    return this.placed.has(player) ? this.placed.get(player)! : this.presented;
  }

  /** The players on a floor: those placed on it, and on a scene of one floor every connected player. */
  playersOn(floor: Floor): string[] {
    if (!this.ports.split()) return [...this.ports.onlinePlayers()];
    return [...this.placed].flatMap(([player, at]) => (at === floor ? [player] : []));
  }

  /** The routes of a floor shared from now on, whose state `state` reads: whose eyes its players see it through goes with its share. */
  open(floor: Floor, state: () => SceneState): FloorRoutes {
    return new FloorRoutes(this, floor, state);
  }

  /** A player left the table. */
  playerLeft(player: string): void {
    this.placed.delete(player);
  }

  /** The scene is no longer shared. */
  clear(): void {
    this.placed.clear();
  }

  /**
   * Sends a message of `floor` (`send` hands it to the wire): to `to` where they stand on it, else to the
   * floor's players, in one message to all while everyone of the scene stands on it as the presented
   * floor. On a scene of one floor everyone stands on it. `marks`: live marks, which covered pages miss.
   */
  toFloor(floor: Floor, to: string | undefined, send: (to?: string) => void, marks: boolean): void {
    const out = (player?: string): void => this.uncovered(player, send, marks);
    if (!this.ports.split()) return out(to);
    if (to !== undefined) {
      if (this.floorOf(to) === floor) out(to);
      return;
    }
    if (this.together && floor === this.presented) return out();
    for (const player of this.playersOn(floor)) out(player);
  }

  /** Live marks only to the pages whose map shows: a message to all then goes to each page left, which batches make no dearer. */
  private uncovered(to: string | undefined, send: (to?: string) => void, marks: boolean): void {
    const covers = marks ? this.ports.covers : undefined;
    const covered = covers?.covered();
    if (covers === undefined || covered === undefined || covered.size === 0) return send(to);
    if (to !== undefined) return void (covered.has(to) || send(to));
    for (const player of covers.connected()) if (!covered.has(player)) send(player);
  }
}
