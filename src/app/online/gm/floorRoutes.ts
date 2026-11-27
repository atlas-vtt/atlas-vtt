import type { GmMessage } from '../protocol/index.ts';
import type { SceneState } from './atlasView.ts';
import { eyesKey, floorEyes, PARTY_EYES, sightHides, type Eyes, type EyesInputs } from './floorEyes.ts';
import type { Floor } from './playerFloors.ts';
import type { SceneRoutes } from './sceneRoutes.ts';

/** The key of the party's eyes, which every floor's picture keeps. */
export const PARTY = eyesKey(PARTY_EYES);

/** What placing a floor's players behind their eyes worked out. */
export interface EyesPlacement {
  /** Each player's eyes now. */
  readonly eyes: ReadonlyMap<string, Eyes>;
  /** The key of each player's eyes before. */
  readonly before: ReadonlyMap<string, string>;
  /** The pictures nobody sees through any more: their pictures close. */
  readonly closed: readonly string[];
}

/**
 * Whose eyes the players of one floor see it through, and so who hears each of its pictures. The floor
 * keeps the party's picture and one for each set of eyes someone saw through when it last placed its
 * players, in the order they opened. A picture's message to all goes to its players, and to every page
 * at once only while everyone shares the party's (`sharedByAll`); a message to one player only where it
 * is of the eyes they see through.
 */
export class FloorRoutes {
  /** The key of the eyes each placed player sees the floor through. */
  private players = new Map<string, string>();
  private readonly pictures = new Set<string>([PARTY]);

  constructor(private readonly scene: SceneRoutes, private readonly floor: Floor, private readonly state: () => SceneState) {}

  /** Places every player on the floor, and `joining` (a player about to be sent their picture), behind the eyes they see it through. */
  placeEyes(inputs: Omit<EyesInputs, 'state' | 'sharedVision'>, joining: readonly string[]): EyesPlacement {
    const asked = [...new Set([...this.scene.playersOn(this.floor), ...joining])];
    const eyes = floorEyes({ ...inputs, state: this.state(), sharedVision: this.scene.ports.sharedVision() }, asked);
    const before = this.players;
    this.players = new Map([...eyes].map(([player, seen]) => [player, eyesKey(seen)]));
    const used = new Set(this.players.values());
    const closed = [...this.pictures].filter((key) => key !== PARTY && !used.has(key));
    for (const key of closed) this.pictures.delete(key);
    for (const key of used) this.pictures.add(key);
    return { eyes, before, closed };
  }

  /** The key of the eyes a player sees the floor through; undefined for a player not placed on it. */
  eyesOf(player: string): string | undefined {
    return this.players.get(player);
  }

  /** The players placed behind eyes on the floor, in the order they were placed. */
  placed(): string[] {
    return [...this.players.keys()];
  }

  /** The players on the floor (`SceneRoutes.playersOn`). */
  playersOn(): string[] {
    return this.scene.playersOn(this.floor);
  }

  /** The players who see the floor through the eyes of `key`: every player of the floor while all share the party's picture. */
  members(key: string): string[] {
    if (key === PARTY && this.sharedByAll()) return this.playersOn();
    return [...this.players].flatMap(([player, eyes]) => (eyes === key ? [player] : []));
  }

  /** The players of the floor whose picture shows a token, as `sees` tells it of a picture's eyes: every player while all share the party's, which shows it. */
  seers(sees: (key: string) => boolean): string[] {
    if (this.sharedByAll()) return this.playersOn();
    return [...this.pictures].flatMap((key) => (key !== PARTY && sees(key) ? this.members(key) : []));
  }

  /** The pictures whose players are told the GM's measurements alike: `all` while everyone shares the party's, else each picture somebody sees. */
  audiences(): 'all' | string[] {
    if (this.sharedByAll()) return 'all';
    return [...this.pictures].filter((key) => this.members(key).length > 0);
  }

  /** A player left the floor or the table. */
  playerLeft(player: string): void {
    this.players.delete(player);
  }

  /** Sends a message of the floor, or of the picture of `key`, to whom it is for (`route`). */
  send(body: GmMessage, to: string | undefined, key?: string): void {
    this.route(to, key, (player) => this.scene.ports.send(body, player), false);
  }

  /** Sends a live message of the floor, or of the picture of `key`, to whom it is for (`route`). */
  sendLive(body: GmMessage, live: string, to: string | undefined, key?: string): void {
    this.route(to, key, (player) => this.scene.ports.sendLive?.(body, live, player), body.t === 'marks');
  }

  /**
   * Whether every page of the floor is sent the party's picture, one not placed yet too: while nobody sees by their own
   * eyes and the floor gives everyone the party's. Nobody does either before the floor has placed its players, as when
   * the GM comes back to a running table, and a message without an addressee reaches every connected page.
   */
  private sharedByAll(): boolean {
    return this.pictures.size === 1 && (this.scene.ports.sharedVision() || !sightHides(this.state()));
  }

  /**
   * A message of the floor (no `key`) goes where the scene sends the floor's; one of a picture to `to` where they see
   * through its eyes, to all at once where it is the party's and everyone shares it, else to each of its players.
   */
  private route(to: string | undefined, key: string | undefined, send: (to?: string) => void, marks: boolean): void {
    const floor = (player?: string): void => this.scene.toFloor(this.floor, player, send, marks);
    if (key === undefined) return floor(to);
    if (to !== undefined) {
      if (this.players.get(to) === key) floor(to);
      return;
    }
    if (key === PARTY && this.sharedByAll()) return floor();
    for (const player of this.members(key)) floor(player);
  }
}
