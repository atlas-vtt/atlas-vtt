import { MAX_ASSET_BYTES, parsePlayerMessage, type AssetRef, type GmMessage, type RollRequestAnswer, type SharedScene } from '../protocol/index.ts';
import { imageDimensions } from '../../imageProcessing/imageDimensions';
import type { RollSceneLookup } from '../../services/playerRollSource';
import type { DiceSource } from './atlasDice.ts';
import { isLit, LIGHTING_REFUSAL, type AtlasPlayerSettings, type LightingSource } from './atlasLighting.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import type { RemoteDrag } from '../marks/index.ts';
import { dragRulerPaths, PlayerDragRulers, type GmRuler, type RulerPaths } from './dragRulers.ts';
import { AssetAnswers } from './assetAnswers.ts';
import { imageMimeType, REPEAT_REQUEST_MS, sha256Hex } from './assetServe.ts';
import type { ScaleImage } from './assetVariants.ts';
import { MineShare } from './mineShare.ts';
import { InputShare } from './InputShare.ts';
import { LiveShare } from './LiveShare.ts';
import type { LoggedRoll, RollRequest } from './log/TableLog.ts';
import { SceneDice } from './SceneDice.ts';
import { MapLayerShare } from './MapLayerShare.ts';
import type { MapLayerSource } from './atlasMapLayers.ts';
import { MarkShare, type MarkSharePorts } from './MarkShare.ts';
import { sceneWalls, type MapSize } from './moveCheck.ts';
import { ownerIn, type SeatSource } from './seatSource.ts';
import { PlayerMoves } from './playerMoves.ts';
import { RulesShare, type RulesSharePorts } from './RulesShare.ts';
import { TOKEN_POLL_MS, TokenShare, type TokenSharePorts } from './TokenShare.ts';

export { imageMimeType, isLit, LIGHTING_REFUSAL, REPEAT_REQUEST_MS };

export interface SceneSharePorts extends TokenSharePorts, RulesSharePorts, Pick<MarkSharePorts, 'gmMarks' | 'showPlayerMarks' | 'showPlayerCursors' | 'nameOf'> {
  notice(text: string): void;
  /** Sends a live message (where dragged tokens are now) ahead of other frames, the latest of a key winning; without it drags reach players through the token list only. */
  sendLive?(body: GmMessage, key: string): void;
  /** What the GM's own drag ruler measures now, or null while it shows none; without it players see none of the GM's. */
  gmDragRuler?(): GmRuler | null;
  /** Draws the rulers of the players' drags for the GM. */
  showPlayerDrags?(drags: readonly RemoteDrag[]): void;
  /** Where the GM's canvas draws these tokens now (the GM's own drag runs ahead of the store there). */
  drawnPlaces?(tokenIds: readonly string[]): ReadonlyMap<string, { readonly x: number; readonly y: number }>;
  /** Who plays and owns which token; without it no player is told which tokens are theirs. */
  seats?: SeatSource | undefined;
  /** Where the GM's lighting reads its rules and measurement, or null while it cannot be read. */
  lightingSource(): LightingSource | null;
  /** The Atlas settings that decide what players get. */
  atlasSettings(): AtlasPlayerSettings;
  /** The shared tab's dice; without them players cannot roll and see no rolls. */
  dice?(): DiceSource | null;
  /** The shared tab's grid, doors, sensed tokens and collection; without it players get none of the map's layers. */
  mapLayers?(): MapLayerSource | null;
  /** Scales an image for a player who asks for a longest side; without it players get originals only. */
  scaleImage?: ScaleImage;
  /** Takes a roll of the shared tab into the table's log. */
  logRoll?(roll: LoggedRoll): void;
  /** The vault path of a speaker's artwork the log shows, by hash. */
  logArt?(hash: string): string | undefined;
  /** The roll button of the log a player's roll answers, as they may roll it. */
  rollRequest?(from: string, answer: RollRequestAnswer): RollRequest | null;
  /** The log entry that tells who found a readable pin of a map, or null while nobody has. */
  foundPin?(mapPath: string, pinId: string): string | null;
}

/**
 * The shared scene of one Atlas tab: what the players see of it (the map image and the tokens they
 * see), sent whole to everyone when it changes, to a player who joins, and to all after a reconnect.
 * Nothing goes out while the scene loads; a scene this step cannot share is withdrawn. Assets go
 * only to a player whose current picture holds them.
 */
export class SceneShare {
  private readonly store: SceneStore;
  private readonly ports: SceneSharePorts;
  private scene: SharedScene | null = null;
  private mapBytes: Uint8Array | null = null;
  /** The shared map's size, by which players' moves are kept on it; null when it is unknown. */
  private mapSize: MapSize | null = null;
  /** The map path and image of the scene sent or being read: a change starts a new scene. */
  private key: string | null = null;
  private refusal: string | null = null;
  private readonly assets: AssetAnswers;
  private readonly tokens: TokenShare;
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

  constructor(store: SceneStore, ports: SceneSharePorts) {
    this.store = store;
    this.ports = ports;
    const seats = ports.seats;
    const ownerOf = ownerIn(seats, store);
    const mine = seats === undefined ? null : new MineShare({ onlinePlayers: () => seats.onlinePlayers(), ownerOf }, (body, to) => ports.send(body, to));
    this.mine = mine;
    this.tokens = new TokenShare(store, ports, (listed) => mine?.setList(listed));
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
    this.layers = new MapLayerShare(store, { ...ports, mapLayers: () => ports.mapLayers?.() ?? null });
    const cursorsShown = (): boolean => ports.atlasSettings().showCursors;
    this.rules = new RulesShare(store, { ...ports, cursorsShown });
    this.moves = new PlayerMoves(store, {
      ...ports,
      context: () => ({
        scene: this.tokens.listedScene,
        listedToken: (alias) => this.tokens.listedToken(alias),
        ownerOf,
        map: this.mapSize,
        walls: sceneWalls(store.getState().objects.walls, this.scene?.lit === true, this.mapSize),
      }),
    });
    this.marks = new MarkShare({ ...ports, cursorsShown }, () => this.mapSize);
    this.dragRulers = new PlayerDragRulers((drags) => ports.showPlayerDrags?.(drags));
    this.assets = new AssetAnswers({ send: (body, to) => ports.send(body, to), now: () => ports.now(), readImage: (path) => ports.readImage(path), scaleImage: ports.scaleImage }, {
      map: () => {
        const map = this.scene?.map ?? null;
        return map !== null && this.mapBytes !== null ? { hash: map.hash, bytes: this.mapBytes, mime: map.mime } : null;
      },
      explored: (hash) => this.inputs.exploredBytes(hash),
      artPath: (hash) => this.artPath(hash),
    });
    this.dice = new SceneDice(store, ports, {
      tokens: this.tokens,
      shownToken: (mapPath, tokenId) => this.shownToken(mapPath, tokenId),
    });
  }

  /** The shared scene's rolls and speakers in the log. */
  readonly dice: SceneDice;

  start(): void {
    this.unsubscribe = this.store.subscribe((state) => void this.update(state));
    void this.update(this.store.getState());
    this.schedulePoll();
    this.moves.start();
    this.dice.start();
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
    this.dice.stop();
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

  /** Who owns which token, which tokens are player tokens, or who is connected changed: players hear which tokens are player tokens and which are theirs now. */
  ownersChanged(): void {
    this.tokens.update();
    this.mine?.update();
  }

  /** A player left the table: their drags end where their tokens are. */
  playerLeft(player: string): void {
    this.moves.playerLeft(player);
    this.marks.playerLeft(player);
    // Chunks queued for them are dropped: when they come back, they may ask again at once.
    this.assets.forget(player);
  }

  /** Withdraws the scene: players see none until a scene is shared again. */
  withdraw(): void {
    this.key = null;
    this.publish(null, null);
  }

  /**
   * A player's message: a drag, drop or cancelled drag of their own token (`PlayerMoves`), a roll (`PlayerRolls`), a laser,
   * measurement or cursor (`MarkShare`), a resync (a whole list), or an asset request, answered only for the map, the explored
   * memory or a token's artwork of the current picture, from the chunk the player asks for on. Players take no token: only
   * the GM gives one, and a claim an older page sends reads as nothing (`parsePlayerMessage`).
   */
  receive(from: string, body: unknown): void {
    const message = parsePlayerMessage(body);
    if (message === null) return;
    if (message.t === 'move') return this.moves.receive(from, message);
    if (message.t === 'drag') return this.moves.drag(from, message);
    if (message.t === 'drag-cancel') return this.moves.dragCancel(from, message);
    if (message.t === 'roll') return this.dice.receive(from, message);
    if (message.t === 'laser' || message.t === 'measure' || message.t === 'cursor') return this.marks.receive(from, message);
    if (message.t === 'resync') return message.of === 'tokens' ? this.tokens.resync(from, message.scene) : this.inputs.resync(from, message.scene, message.of);
    if (message.t === 'asset-request') this.assets.answer(from, message);
  }

  /** The GM id of a token by the id players know it by in the list of `scene`, while that is the scene of the last list they were sent. */
  listedToken(scene: string, alias: string): string | undefined {
    return scene === this.tokens.listedScene ? this.tokens.listedToken(alias) : undefined;
  }

  /** A token of the scene players were last sent a list of, as their frame shows it now; null when they do not see it. */
  private shownToken(mapPath: string, tokenId: string): ReturnType<RollSceneLookup['shownToken']> {
    const state = this.store.getState();
    if (this.tokens.listedScene === null || state.mapPath !== mapPath) return null;
    return this.ports.tokenSource()?.playerRollTokens(mapPath, [tokenId]).get(tokenId) ?? null;
  }

  /** The vault path of artwork the players' current picture shows, by hash: a token's or an initiative portrait's. */
  private artPath(hash: string): string | undefined {
    return this.tokens.artPath(hash) ?? this.layers.artPath(hash) ?? this.ports.logArt?.(hash);
  }

  /** Looks again every `TOKEN_POLL_MS`: Atlas's dynamic lighting and the map's measurement may change without a store change. */
  private schedulePoll(): void {
    this.poll = this.ports.setTimer(() => {
      this.poll = undefined;
      void this.update(this.store.getState());
      this.rules.update();
      this.marks.update();
      this.schedulePoll();
    }, TOKEN_POLL_MS);
  }

  private async update(state: SceneState): Promise<void> {
    if (!state.mapLoaded || state.isMapLoading) return;
    const lit = isLit(state, this.ports.atlasSettings());
    const refusal = lit && this.ports.lightingSource() === null ? LIGHTING_REFUSAL : null;
    if (refusal !== null) {
      if (refusal !== this.refusal) this.ports.notice(refusal);
      this.refusal = refusal;
      if (this.key !== null || this.scene !== null) this.withdraw();
      return;
    }
    this.refusal = null;
    const key = `${state.mapPath ?? ''}\n${state.background ?? ''}\n${lit}`;
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
    const built = await this.build(state.background);
    if (this.key !== key) return;
    if (built === null) {
      this.ports.notice('Atlas Online cannot send this scene\'s map image.');
      this.publish(null, null);
      return;
    }
    this.publish({ id: this.ports.randomId(), map: built.map, lit }, built.bytes, built.size);
  }

  private async build(background: string | null): Promise<{ readonly map: AssetRef | null; readonly bytes: Uint8Array | null; readonly size: MapSize | null } | null> {
    if (background === null) return { map: null, bytes: null, size: null };
    const image = await this.ports.readImage(background);
    if (image === null || image.bytes.length > MAX_ASSET_BYTES) return null;
    const size = await imageDimensions(new Blob([image.bytes]));
    return { map: { hash: await sha256Hex(image.bytes), size: image.bytes.length, mime: image.mime }, bytes: image.bytes, size };
  }

  private publish(scene: SharedScene | null, bytes: Uint8Array | null, size: MapSize | null = null): void {
    this.scene = scene;
    this.mapBytes = bytes;
    this.mapSize = size;
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
