import type { PlayerMessage, SharedFloor, SharedScene } from '../protocol/index.ts';
import type { ShownRollToken } from '../../services/playerRollSource';
import { isLit, LIGHTING_REFUSAL } from './atlasLighting.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import { dragRulerPaths, PlayerDragRulers, type RulerPaths } from './dragRulers.ts';
import { AssetAnswers } from './assetAnswers.ts';
import { readFloorImages, type FloorImages } from './floorImages.ts';
import { readFloorVideo, type SharedVideo } from './floorVideo.ts';
import { floorPlacement, floorWorldSize } from './floorPlacement.ts';
import { MineShare } from './mineShare.ts';
import { mapRollDice, tokenRollDice } from './rollAdvantage.ts';
import { InputShare } from './InputShare.ts';
import { LiveShare } from './LiveShare.ts';
import { MapLayerShare } from './MapLayerShare.ts';
import { MarkShare } from './MarkShare.ts';
import { sceneWalls, type MapSize } from './moveCheck.ts';
import { ownerIn } from './seatSource.ts';
import { PlayerMoves } from './playerMoves.ts';
import type { SceneSharePorts } from './sceneSharePorts.ts';
import { movesOutOfTurn } from './turnShare.ts';
import { RulesShare } from './RulesShare.ts';
import { TOKEN_POLL_MS, TokenShare } from './TokenShare.ts';
import { levelObjects } from '../../levels/levelObjects';
import { levelBackground } from '../../levels/levelEdits';
import { viewedLevelId } from '../../levels/sceneLevels';

export interface FloorSharePorts extends SceneSharePorts {
  /** Which floor of its map this scene is, for players to tell; none for a map of one floor. */
  floor?(): SharedFloor | undefined;
}

/**
 * What the players on one floor see of the shared scene (the whole scene where it has one floor): the
 * floor's map image and the tokens they see, sent whole to them when it changes, to a player
 * who joins, and after a reconnect. Its store shows the floor (`FloorStore`), so every share it holds
 * reads that floor's objects. Nothing goes out while the scene loads; a scene this step cannot share is
 * withdrawn. Assets go only to a player whose current picture holds them.
 */
export class FloorShare {
  private readonly store: SceneStore;
  private readonly ports: FloorSharePorts;
  private scene: SharedScene | null = null;
  private images: Pick<FloorImages, 'map'> = { map: null };
  /** The map's video while the map is an animated one players may play in its poster's place. */
  private video: SharedVideo | null = null;
  /** The floor map's size in world pixels (its image as Atlas draws it), by which players' moves are kept on it; null when it is unknown. */
  private mapSize: MapSize | null = null;
  /** The map path, floor, images and placement of the scene sent or being read: a change starts a new scene. */
  private key: string | null = null;
  private refusal: string | null = null;
  private readonly assets: AssetAnswers;
  readonly tokens: TokenShare;
  private readonly live: LiveShare | null;
  private readonly mine: MineShare | null;
  private readonly inputs: InputShare;
  /** What players see of the map beside its tokens, the readable pins among it. */
  readonly layers: MapLayerShare;
  private readonly rules: RulesShare;
  private readonly moves: PlayerMoves;
  private readonly marks: MarkShare;
  private readonly dragRulers: PlayerDragRulers;
  private unsubscribe: (() => void) | null = null;
  private poll: number | undefined;

  constructor(store: SceneStore, ports: FloorSharePorts) {
    this.store = store;
    this.ports = ports;
    const seats = ports.seats;
    const ownerOf = ownerIn(seats, store);
    const diceOf = (tokenId: string): ReturnType<typeof tokenRollDice> => tokenRollDice(ports.dice?.() ?? null, store.getState().objects.tokens[tokenId]);
    const mine = seats === undefined ? null : new MineShare({ onlinePlayers: () => seats.onlinePlayers(), ownerOf, diceOf }, (body, to) => ports.send(body, to));
    this.mine = mine;
    // The initiative list shows the players' look-alike numbers too: it follows them as they change
    this.tokens = new TokenShare(store, { ...ports, numbersChanged: () => this.layers.update(), liveCarriedUntil: (alias) => this.live?.carriedUntil(alias) }, (listed) => mine?.setList(listed));
    const rulers = (): RulerPaths => dragRulerPaths(store.getState(), ports.gmDragRuler?.() ?? null, this.moves.dragStarts());
    this.live = ports.sendLive === undefined ? null : new LiveShare(store, { ...ports, sendLive: (body, key) => ports.sendLive?.(body, key), rulers }, () => ({
      scene: this.tokens.listedScene,
      alias: (tokenId) => this.tokens.listedAlias(tokenId),
    }));
    this.inputs = new InputShare(store, {
      ...ports,
      shownTokens: () => this.tokens.shownIds(),
      tokenAlias: (id) => this.tokens.alias(id),
    });
    this.layers = new MapLayerShare(store, { ...ports, mapLayers: () => ports.mapLayers?.() ?? null, badgeOf: (tokenId) => this.tokens.badgeOf(tokenId), tokenAlias: (tokenId) => this.tokens.listedAlias(tokenId) });
    const cursorsShown = (): boolean => ports.atlasSettings().showCursors;
    this.rules = new RulesShare(store, { ...ports, cursorsShown, rollDice: () => mapRollDice(ports.dice?.() ?? null) });
    this.moves = new PlayerMoves(store, {
      ...ports,
      context: () => ({
        scene: this.tokens.listedScene,
        listedToken: (alias) => this.tokens.listedToken(alias),
        ownerOf,
        map: this.mapSize,
        // The walls of this floor, on which every token of its list stands
        walls: sceneWalls(levelObjects(store.getState()).walls, this.scene?.lit === true, this.mapSize),
        outOfTurn: (tokenId) => {
          const settings = ports.atlasSettings();
          return movesOutOfTurn(store.getState(), { movesOnTurn: settings.movesOnTurn === true, showInitiative: settings.showInitiative, definitions: ports.tokenRules?.()?.resources ?? [] }, tokenId);
        },
      }),
    });
    this.marks = new MarkShare({ ...ports, cursorsShown }, () => this.mapSize);
    this.dragRulers = new PlayerDragRulers((drags) => ports.showPlayerDrags?.(drags));
    this.assets = new AssetAnswers({ send: (body, to) => ports.send(body, to), now: () => ports.now(), readImage: (path) => ports.readImage(path), scaleImage: ports.scaleImage, readVideo: ports.readVideo }, {
      map: () => this.images.map,
      video: () => this.video,
      explored: (hash) => this.inputs.exploredBytes(hash),
      artPath: (hash) => this.artPath(hash),
    });
  }

  /** The id of the scene players were sent last, or null while none is shared. */
  get sceneId(): string | null {
    return this.scene?.id ?? null;
  }

  /** The map's size, for the picture worked out of a floor the GM does not look at; null while it is unknown. */
  get mapBounds(): MapSize | null {
    return this.mapSize;
  }

  start(): void {
    this.unsubscribe = this.store.subscribe((state) => void this.update(state));
    void this.update(this.store.getState());
    this.schedulePoll();
    this.moves.start();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.poll !== undefined) this.ports.clearTimer(this.poll);
    this.poll = undefined;
    this.tokens.stop();
    this.live?.stop();
    this.inputs.stop();
    this.layers.stop();
    this.moves.stop();
    this.marks.stop();
    this.dragRulers.clear();
  }

  /** The scene, its tokens and its inputs again, to one player or to all; sent to all, assets may be asked for again at once. */
  resend(to?: string): void {
    if (to === undefined) this.assets.forget();
    this.ports.send({ t: 'scene', scene: this.scene }, to);
    this.tokens.resend(to);
    this.inputs.resend(to);
    this.layers.resend(to);
    this.rules.resend(to);
    this.mine?.resend(to);
    this.marks.resend(to);
  }

  /** A player's map shows again: they are sent the marks as they are now, also where there are none, so none they held stays. */
  catchUpMarks(to: string): void {
    this.marks.catchUp(to);
  }

  /** Who owns which token, which tokens are player tokens, or who is connected changed. */
  ownersChanged(): void {
    this.tokens.update();
    this.mine?.update();
  }

  /** A player left the table or this floor: their drags end where their tokens are, and their marks go. */
  playerLeft(player: string): void {
    this.moves.playerLeft(player);
    this.marks.playerLeft(player);
    // Chunks queued for them are dropped: when they come back, they may ask again at once.
    this.assets.forget(player);
  }

  /** Withdraws the scene: players see none until a scene is shared again. */
  withdraw(): void {
    this.key = null;
    this.publish(null, null, null);
  }

  /** The GM's canvas shows another floor now, or this one again: what it draws of players' marks starts afresh. */
  viewChanged(): void {
    this.marks.update();
    this.dragRulers.clear();
  }

  /**
   * A player's message on this floor: a drag, drop or cancelled drag of their own token, a laser,
   * measurement or cursor, a resync, or an asset request, answered only for the map, the
   * explored memory or a token's artwork of the current picture.
   */
  receive(from: string, message: PlayerMessage): void {
    if (message.t === 'move') return this.moves.receive(from, message);
    if (message.t === 'drag') return this.moves.drag(from, message);
    if (message.t === 'drag-cancel') return this.moves.dragCancel(from, message);
    if (message.t === 'laser' || message.t === 'measure' || message.t === 'cursor') return this.marks.receive(from, message);
    if (message.t === 'resync') return message.of === 'tokens' ? this.tokens.resync(from, message.scene) : this.inputs.resync(from, message.scene, message.of);
    if (message.t === 'asset-request') this.assets.answer(from, message);
  }

  /** The GM id of a token by the id players know it by in the list of `scene`, while that is the scene of the last list they were sent. */
  listedToken(scene: string, alias: string): string | undefined {
    return scene === this.tokens.listedScene ? this.tokens.listedToken(alias) : undefined;
  }

  /** The tokens among `tokenIds` the players of this floor see now, while it shows `mapPath`. */
  shown(mapPath: string, tokenIds: readonly string[]): ReadonlyMap<string, ShownRollToken> {
    if (this.store.getState().mapPath !== mapPath) return new Map();
    return this.ports.tokenSource()?.playerRollTokens(mapPath, tokenIds) ?? new Map();
  }

  /** The vault path of artwork the players' current picture shows, by hash: a token's or an initiative portrait's. */
  private artPath(hash: string): string | undefined {
    return this.tokens.artPath(hash) ?? this.layers.artPath(hash) ?? this.ports.logArt?.(hash);
  }

  /** Looks again every `TOKEN_POLL_MS`: the map's measurement may change without a store change. */
  private schedulePoll(): void {
    this.poll = this.ports.setTimer(() => {
      this.poll = undefined;
      void this.update(this.store.getState());
      this.rules.update();
      // A character's template may name another dice set at any time
      this.mine?.update();
      this.marks.update();
      this.schedulePoll();
    }, TOKEN_POLL_MS);
  }

  private async update(state: SceneState): Promise<void> {
    if (!state.mapLoaded || state.isMapLoading) return;
    const lit = isLit(state);
    const refusal = lit && this.ports.lightingSource() === null ? LIGHTING_REFUSAL : null;
    if (refusal !== null) {
      if (refusal !== this.refusal) this.ports.notice(refusal);
      this.refusal = refusal;
      if (this.key !== null || this.scene !== null) this.withdraw();
      return;
    }
    this.refusal = null;
    // The map of the floor shown, whose objects the shares send (`levelObjects`)
    const level = viewedLevelId(state);
    const background = levelBackground(state, level);
    const floor = this.ports.floor?.();
    // A map drawn another way is another world: its tokens, walls and fog moved with it in the same write.
    const placement = floorPlacement(state, level, background);
    const key = JSON.stringify([state.mapPath, level, background, lit, floor ?? null, placement]);
    if (key === this.key) {
      this.marks.update();
      this.tokens.update();
      this.live?.update();
      this.dragRulers.update(state, this.moves.dragStarts());
      this.layers.update();
      return this.inputs.update();
    }
    this.key = key;
    this.tokens.setScene(null);
    this.inputs.setScene(null);
    this.layers.setScene(null);
    const built = await readFloorImages((path) => this.ports.readImage(path), background);
    if (this.key !== key) return;
    if (built === null) {
      this.ports.notice('Atlas Online cannot send this scene\'s map image.');
      this.publish(null, null, null);
      return;
    }
    const readVideo = this.ports.readVideo;
    const video = built.map === null || readVideo === undefined ? null : await readFloorVideo(readVideo, background);
    if (this.key !== key) return;
    const scene: SharedScene = { id: this.ports.randomId(), map: built.map?.ref ?? null, lit, ...(floor !== undefined && { floor }), ...placement, ...(video !== null && { video: video.ref }) };
    this.publish(scene, { map: built.map, size: built.size && floorWorldSize(state, level, built.size) }, video);
  }

  private publish(scene: SharedScene | null, built: FloorImages | null, video: SharedVideo | null): void {
    this.scene = scene;
    this.images = { map: built?.map ?? null };
    this.video = video;
    this.mapSize = built?.size ?? null;
    this.moves.sceneChanged();
    this.dragRulers.clear();
    this.tokens.setScene(null);
    this.inputs.setScene(null);
    this.layers.setScene(null);
    this.rules.setScene(null);
    // Marks of the scene before must not follow the new one: the live lane would let them overtake it.
    this.marks.setScene(null);
    this.resend();
    this.tokens.setScene(scene?.id ?? null);
    this.live?.setScene(scene);
    this.inputs.setScene(scene);
    this.layers.setScene(scene);
    this.rules.setScene(scene?.id ?? null);
    this.marks.setScene(scene?.id ?? null);
  }
}
