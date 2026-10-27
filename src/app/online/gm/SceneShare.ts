import { parsePlayerMessage, type SharedFloor } from '../protocol/index.ts';
import type { ShownRollToken } from '../../services/playerRollSource';
import { isLit, LIGHTING_REFUSAL } from './atlasLighting.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import { imageMimeType, REPEAT_REQUEST_MS } from './assetServe.ts';
import { FloorAudience } from './floorAudience.ts';
import { floorPorts, noticeOnce } from './floorPorts.ts';
import { FloorShare } from './FloorShare.ts';
import { FloorSight } from './floorSight.ts';
import { FloorStore } from './floorStore.ts';
import { floorKey as keyOf, FloorTokens } from './floorTokens.ts';
import type { ListedPin } from './pins/ReadablePins.ts';
import { playerFloors, sharedFloor, type Floor } from './playerFloors.ts';
import { SceneDice } from './SceneDice.ts';
import type { SceneSharePorts } from './sceneSharePorts.ts';
import { TOKEN_POLL_MS } from './TokenShare.ts';
import { hasLevels, resolveLevel, viewedLevelId } from '../../levels/sceneLevels';

export { imageMimeType, isLit, LIGHTING_REFUSAL, REPEAT_REQUEST_MS };
export type { SceneSharePorts };

const DEFAULT_CELL = 70;

/**
 * The shared scene of one Atlas tab: what each player sees of it. A scene with several levels is
 * shared floor by floor (`FloorShare`): each player sees the floor their own token stands on (the one
 * they last moved or acted with where they have several), players without one the floor Atlas
 * presents (the eye), and a floor is shared only while a player stands on it, besides the presented
 * one. A floor's messages reach its players alone (`FloorAudience`); a scene of one floor goes to all
 * as it always did. The floor the GM's view shows reads the players' picture from the GM's renderer,
 * any other works it out on the CPU (`FloorSight`). A token that takes stairs takes its player along.
 */
export class SceneShare {
  private readonly store: SceneStore;
  private readonly ports: SceneSharePorts;
  private readonly floors = new Map<string, FloorShare>();
  private readonly audience = new FloorAudience();
  /** The token each player last moved or acted with, by GM id. */
  private readonly acting = new Map<string, string>();
  /** The ids players know tokens by, the same on every floor, and what rolls and books read of the floors' lists. */
  private readonly tokens: FloorTokens;
  /** The random id the floors of the scene's map share, by map path. */
  private group: { readonly map: string | null; readonly id: string } | null = null;
  private viewed: Floor | undefined = undefined;
  /** What the floors were last worked out from: they are worked out again only when one of these changed. */
  private assigned: readonly unknown[] = [];
  private assigning = false;
  private unsubscribe: (() => void) | null = null;
  private poll: number | undefined;
  /** Tells the GM a notice once, however many floors tell it. */
  private readonly notice: (text: string) => void;
  /** The shared scene's rolls and speakers in the log. */
  readonly dice: SceneDice;
  /** The readable pins players see now, on whichever floor they are. */
  readonly layers: { readablePin(sceneId: string, alias: string): (ListedPin & { readonly map: string }) | null; update(): void };

  constructor(store: SceneStore, ports: SceneSharePorts) {
    this.store = store;
    this.ports = ports;
    this.notice = noticeOnce(ports);
    this.tokens = new FloorTokens({ store, ports, floors: this.floors, shareOf: (player) => this.shareOf(player), together: () => this.audience.allTogether });
    this.dice = new SceneDice(store, ports, this.tokens.diceParts());
    this.layers = {
      readablePin: (sceneId, alias) => this.tokens.shareOfScene(sceneId)?.layers.readablePin(sceneId, alias) ?? null,
      update: () => {
        for (const share of this.floors.values()) share.layers.update();
      },
    };
  }

  start(): void {
    this.unsubscribe = this.store.subscribe(() => this.assign());
    this.assign();
    this.schedulePoll();
    this.dice.start();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.poll !== undefined) this.ports.clearTimer(this.poll);
    this.poll = undefined;
    for (const share of this.floors.values()) share.stop();
    this.floors.clear();
    this.audience.clear();
    this.dice.stop();
  }

  /** The scene, its tokens and its inputs again, to one player (their floor's) or to all (each floor's to its players). */
  resend(to?: string): void {
    if (to === undefined) {
      for (const share of this.floors.values()) share.resend();
      return;
    }
    const share = this.shareOf(to);
    // A floor still reading its map sends its scene to its players once it has it
    if (share !== undefined && (share.sceneId !== null || !this.split())) share.resend(to);
  }

  /** A player's map shows again: they are sent the marks of their floor as they are now. */
  catchUpMarks(to: string): void {
    this.shareOf(to)?.catchUpMarks(to);
  }

  /** Who owns which token, which tokens are player tokens, or who is connected changed: each player's floor is worked out again. */
  ownersChanged(): void {
    // Owners are no part of what the floors are compared by: they are worked out again whatever else stayed
    this.assigned = [];
    this.assign();
    for (const share of this.floors.values()) share.ownersChanged();
  }

  /** A player left the table: their drags end where their tokens are. */
  playerLeft(player: string): void {
    this.shareOf(player)?.playerLeft(player);
    this.audience.delete(player);
    this.acting.delete(player);
  }

  /** Withdraws the scene: players see none until a scene is shared again. */
  withdraw(): void {
    for (const share of this.floors.values()) share.withdraw();
  }

  /** A message of a player that another part of the table answers (`book-token`: the token they act with), which tells the floor they look at. */
  heard(from: string, body: unknown): void {
    if (typeof body !== 'object' || body === null) return;
    const { t, scene, token } = body as Record<string, unknown>;
    if (t === 'book-token' && typeof scene === 'string' && typeof token === 'string') this.noteActing(from, scene, token);
  }

  /** A player's message, to the share of their floor; a roll to the scene's dice. */
  receive(from: string, body: unknown): void {
    const message = parsePlayerMessage(body);
    if (message === null) return;
    if (message.t === 'roll') return this.dice.receive(from, message);
    this.shareOf(from)?.receive(from, message);
    if (message.t === 'move' || message.t === 'drag') this.noteActing(from, message.scene, message.id);
  }

  /** The GM id of a token by the id players know it by in the list of `scene`, while that is a floor's last list. */
  listedToken(scene: string, alias: string): string | undefined {
    return this.tokens.shareOfScene(scene)?.listedToken(scene, alias);
  }

  /** The tokens among `tokenIds` that the players of each token's floor see now, as their frame names them: what the books read. */
  shown(mapPath: string, tokenIds: readonly string[]): ReadonlyMap<string, ShownRollToken> {
    return this.tokens.shown(mapPath, tokenIds);
  }

  /** Whether the scene has several floors now. */
  private split(): boolean {
    return hasLevels(this.store.getState().levels);
  }

  /** Notes the token a player moved or acts with, which decides their floor where they have tokens on several. */
  private noteActing(from: string, scene: string, alias: string): void {
    const tokenId = this.listedToken(scene, alias);
    const token = tokenId === undefined ? undefined : this.store.getState().objects.tokens[tokenId];
    if (tokenId === undefined || token === undefined || this.ports.seats?.ownerOf(tokenId, token) !== from || this.acting.get(from) === tokenId) return;
    this.acting.set(from, tokenId);
    this.assign();
  }

  /** The share of the floor a player stands on, worked out now for a player not yet placed. */
  private shareOf(player: string): FloorShare | undefined {
    return this.floors.get(keyOf(this.floorOf(player)));
  }

  /** The floor a player stands on, worked out now for a player not yet placed. */
  private floorOf(player: string): Floor {
    if (!this.audience.has(player) && !this.assigning) this.assign([player]);
    return this.audience.floorOf(player);
  }

  /**
   * Works out on which floor each connected player stands (and `extra`, a player about to be sent their
   * floor), opens the share of every floor a player stands on and of the presented floor, closes the
   * others, and sends a player whose floor changed the floor they reached.
   */
  private assign(extra: readonly string[] = []): void {
    if (this.assigning) return;
    const state = this.store.getState();
    const levels = hasLevels(state.levels);
    const presented = levels ? resolveLevel(state.levels, this.ports.presentedLevel?.()) : null;
    const players = [...new Set([...(this.ports.seats?.onlinePlayers() ?? []), ...extra])];
    const inputs = [state.objects.tokens, state.levels, presented, players.join('\n'), [...this.acting].join('\n')];
    if (this.floors.size === 0 || extra.length > 0 || inputs.some((input, i) => input !== this.assigned[i])) {
      this.assigned = inputs;
      this.assigning = true;
      try {
        this.place(state, players, presented);
      } finally {
        this.assigning = false;
      }
    }
    this.followView(levels ? viewedLevelId(state) : null);
  }

  private place(state: SceneState, players: readonly string[], presented: Floor): void {
    const seats = this.ports.seats;
    const { floors, together } = playerFloors({ state, ownerOf: (id, token) => seats?.ownerOf(id, token), acting: this.acting, presented }, players);
    const before = this.audience.set(floors, together, presented);
    const wanted = new Set([keyOf(presented), ...[...floors.values()].map(keyOf)]);
    for (const key of wanted) if (!this.floors.has(key)) this.open(key === '' ? null : key);
    for (const [player, floor] of floors) {
      if (!before.has(player) || before.get(player) === floor) continue;
      this.floors.get(keyOf(before.get(player)!))?.playerLeft(player);
      const share = this.floors.get(keyOf(floor));
      // A floor still reading its map sends its scene to its players once it has it
      if (share !== undefined && share.sceneId !== null) share.resend(player);
    }
    for (const [key, share] of this.floors) {
      if (wanted.has(key)) continue;
      share.stop();
      this.floors.delete(key);
    }
  }

  /** The GM's view shows another floor: the players' marks it drew of the last one go, and the floor it shows now draws its own. */
  private followView(viewed: Floor): void {
    if (viewed === this.viewed) return;
    const first = this.viewed === undefined;
    this.viewed = viewed;
    if (first) return;
    this.ports.showPlayerMarks?.({ lasers: [], measures: [] });
    this.ports.showPlayerDrags?.([]);
    this.ports.showPlayerCursors?.([]);
    for (const share of this.floors.values()) share.viewChanged();
  }

  private open(floor: Floor): void {
    const store = new FloorStore(this.store, floor);
    let share: FloorShare | null = null;
    const route = (to: string | undefined, send: (to?: string) => void): void => {
      if (!this.split()) return send(to);
      this.audience.route(floor, to, (player) => this.floorOf(player), send);
    };
    share = new FloorShare(store, floorPorts(this.ports, {
      // The GM's renderer is this floor's picture while the GM looks at it and it has drawn it
      viewed: () => !this.split() || (viewedLevelId(this.store.getState()) === floor && this.ports.rendererCurrent?.() !== false),
      sight: new FloorSight({ state: () => store.getState(), map: () => share?.mapBounds ?? null, lightingSource: () => this.ports.lightingSource() }),
      cell: () => this.ports.tokenSource()?.getGridOptions()?.size ?? this.store.getState().grid?.size ?? DEFAULT_CELL,
      aliases: this.tokens.aliases,
      send: (body, to) => route(to, (player) => this.ports.send(body, player)),
      sendLive: (body, key, to) => route(to, (player) => this.ports.sendLive?.(body, key, player)),
      playersOn: () => (this.split() ? this.audience.playersOn(floor) : null),
      notice: this.notice,
      describe: () => this.describe(floor),
    }));
    this.floors.set(keyOf(floor), share);
    share.start();
  }

  /** Which floor of its map `floor` is, as players are told (the map's floors by one random group id); none for a scene of one floor. */
  private describe(floor: Floor): SharedFloor | undefined {
    const state = this.store.getState();
    if (!hasLevels(state.levels)) return undefined;
    if (this.group?.map !== state.mapPath) this.group = { map: state.mapPath, id: this.ports.randomId() };
    return sharedFloor(state, floor, this.group.id);
  }

  /** Looks again every `TOKEN_POLL_MS`: Atlas may present another floor without a change of the store. */
  private schedulePoll(): void {
    this.poll = this.ports.setTimer(() => {
      this.poll = undefined;
      this.assign();
      this.schedulePoll();
    }, TOKEN_POLL_MS);
  }
}
