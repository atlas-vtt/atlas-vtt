import { GM_MARKS, parseImageSize, type PlayerMessage, type SharedScene } from '../protocol/index.ts';
import type { ShownRollToken } from '../../services/playerRollSource';
import { isLit, LIGHTING_REFUSAL } from './atlasLighting.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import { dragRulerPaths, PlayerDragRulers, type RulerPaths } from './dragRulers.ts';
import { readFloorImages } from './floorImages.ts';
import { readFloorVideo } from './floorVideo.ts';
import { floorPlacement, floorWorldSize } from './floorPlacement.ts';
import { mapRollDice } from './rollAdvantage.ts';
import { FloorPictures } from './floorPictures.ts';
import type { FloorSharePorts } from './floorPorts.ts';
import type { ListedPin } from './pins/ReadablePins.ts';
import { MarkShare } from './MarkShare.ts';
import { PlayerMeasures } from './playerMeasures.ts';
import { sceneWalls, type MapSize } from './moveCheck.ts';
import { ownerIn } from './seatSource.ts';
import { PlayerDrawings } from './playerDrawings.ts';
import { ClearedPlayers } from './playerDrawingsClear.ts';
import { PlayerMoves } from './playerMoves.ts';
import { PlayerDoorAsks, type DoorAskShown } from './doors/PlayerDoorAsks.ts';
import { playerMoveDistance } from './playerTurnMoves.ts';
import { movesOutOfTurn } from './turnShare.ts';
import { RulesShare } from './RulesShare.ts';
import { TOKEN_POLL_MS, type TokenShare } from './TokenShare.ts';
import { levelObjects } from '../../levels/levelObjects';
import { levelBackground } from '../../levels/levelEdits';
import { viewedLevelId } from '../../levels/sceneLevels';
import { drawCell } from '../../annotations/drawSizes';
import { isVideoMapPath, videoMimeType } from '../../pixi/mosaicCanvas/video/videoMapFiles';
import { isHistoryTravelling } from '../../stores/history';
import { tableControlsStore } from '../../stores/tableControlsStore';
import { sceneDiceShelf, sharedDiceRow } from './diceRowShare.ts';
import { t } from '../../i18n';

/** The type of an animated map's video by its path, or null for a path that is no video map. */
const videoMimeOf = (path: string): string | null => (isVideoMapPath(path) ? videoMimeType(path) : null);

/**
 * What the players on one floor see of the shared scene (the whole scene where it has one floor): the
 * floor's map image, sent whole to them when it changes, to a player who joins, and after a reconnect,
 * with what each sees of it (`FloorPictures`: the tokens, fog and lighting inputs, layers). Its store
 * shows the floor (`FloorStore`), so every share it holds reads that floor's objects. Nothing goes out
 * while the scene loads; a scene this step cannot share is withdrawn. Assets go only to a player whose
 * current picture holds them.
 */
export class FloorShare {
  private readonly store: SceneStore;
  private readonly ports: FloorSharePorts;
  private scene: SharedScene | null = null;
  /** The floor map's size in world pixels (its image as Atlas draws it), by which players' moves are kept on it; null when it is unknown. */
  private mapSize: MapSize | null = null;
  /** The map path, floor, images and placement of the scene sent or being read: a change starts a new scene. */
  private key: string | null = null;
  private refusal: string | null = null;
  /** The id the next scene keeps: references made again (`refreshAssets`) are no new scene. */
  private keepId: string | null = null;
  /** What each set of eyes sees of the floor. */
  private readonly pictures: FloorPictures;
  private readonly rules: RulesShare;
  private readonly moves: PlayerMoves;
  /** Players' asks to open this floor's doors, and their tokens' bumps. */
  private readonly doors: PlayerDoorAsks;
  private readonly measures: PlayerMeasures;
  private readonly marks: MarkShare;
  /** The players' own drawings and texts on this floor. */
  private readonly drawings: PlayerDrawings;
  /** Whose drawings the GM cleared: what such a player is drawing just then goes with them. */
  private readonly cleared = new ClearedPlayers();
  /** Whether a player's own request is being written now: what it removes is no clearing by the GM. */
  private dealing = false;
  private readonly dragRulers: PlayerDragRulers;
  private unsubscribe: (() => void) | null = null;
  private poll: number | undefined;

  constructor(store: SceneStore, ports: FloorSharePorts) {
    this.store = store;
    this.ports = ports;
    const seats = ports.seats;
    const ownerOf = ownerIn(seats, store);
    const cursorsShown = (): boolean => ports.atlasSettings().showCursors;
    const playersDraw = (): boolean => ports.atlasSettings().playersDraw === true;
    this.pictures = new FloorPictures(store, ports, {
      rulers: (): RulerPaths => dragRulerPaths(store.getState(), ports.gmDragRuler?.() ?? null, this.moves.dragStarts()),
      // A held token no player drags is held by the GM's own pointer
      holder: (tokenId) => (cursorsShown() ? this.moves.draggerOf(tokenId) ?? GM_MARKS : undefined),
      drawnBy: (player, above) => (playersDraw() ? this.drawings.mine(player, above) : null),
      map: () => this.mapSize,
    });
    // The players of this floor: each sees the floor their own token stands on.
    const seated = (player: string): boolean => seats?.onlinePlayers().includes(player) === true;
    this.drawings = new PlayerDrawings(store, {
      send: (body, to) => ports.send(body, to),
      now: () => ports.now(),
      allowed: playersDraw,
      seated,
      map: () => this.mapSize,
      changed: () => this.pictures.layersChanged(),
      strokeEnded: (player, n, made) => this.marks.strokeEnded(player, n, made),
    });
    const draw = (): { readonly cell: number } | null => (playersDraw() ? { cell: drawCell(store.getState().grid) } : null);
    const doorsAllowed = (): boolean => ports.atlasSettings().playersOpenDoors === true;
    this.rules = new RulesShare(store, {
      ...ports, cursorsShown, doors: doorsAllowed, rollDice: () => mapRollDice(ports.dice?.() ?? null), draw, diceRow: () => sharedDiceRow(sceneDiceShelf(ports, store)),
    });
    this.moves = new PlayerMoves(store, {
      ...ports,
      // A player acts on tokens their own picture lists: a refusal tells where a token stands only to someone who sees it
      context: (from) => ({
        scene: this.pictures.of(from).tokens.listedScene,
        listedToken: (alias) => this.pictures.of(from).tokens.listedToken(alias),
        ownerOf,
        map: this.mapSize,
        // The walls of this floor, on which every token of its list stands
        walls: sceneWalls(levelObjects(store.getState()).walls, this.scene?.lit === true, this.mapSize),
        paused: () => tableControlsStore.getState().paused,
        outOfTurn: (tokenId) => {
          const settings = ports.atlasSettings();
          return movesOutOfTurn(store.getState(), { movesOnTurn: settings.movesOnTurn === true, definitions: ports.tokenRules?.()?.resources ?? [] }, tokenId);
        },
        // A player's drop counts towards the turn's movement as the GM's own drag does (`DragRuler.countDrop`)
        turnMove: (tokenId, from, to) => (ports.tokenMoves?.()?.rules().countPerTurn === true ? playerMoveDistance(store.getState(), ports.measurement?.() ?? null, tokenId, from, to) : null),
      }),
    });
    this.doors = new PlayerDoorAsks(store, {
      allowed: doorsAllowed,
      scene: () => this.tokens.listedScene,
      listedToken: (alias) => this.tokens.listedToken(alias),
      ownerOf,
      nameOf: (player) => ports.nameOf?.(player) ?? null,
      send: (body, to) => ports.send(body, to),
      now: () => ports.now(),
      ...(ports.askDoor !== undefined && { ask: (shown: DoorAskShown) => ports.askDoor?.(shown) ?? (() => undefined) }),
      bump: (tokenId, dx, dy) => ports.bumpToken?.(tokenId, dx, dy),
    });
    this.measures = new PlayerMeasures(store, { now: () => ports.now(), seated, scene: () => this.sceneId, map: () => this.mapSize });
    // An aura names its token by the id the token list gives it
    this.marks = new MarkShare({
      ...ports, cursorsShown, tokenAlias: (tokenId) => this.tokens.alias(tokenId), keptBy: (measure) => this.measures.told(measure),
      gmMarks: () => ports.gmMarks?.() ?? null,
      audiences: (seen) => this.pictures.markAudiences(seen),
      // A drawing under way is followed only where a request to make it would be taken.
      strokesTaken: (player, scene) => (this.drawings.refusal(player, scene) === null ? { cell: drawCell(store.getState().grid) } : null),
      fog: () => this.pictures.party.layers.committedFog(),
    }, () => this.mapSize);
    this.dragRulers = new PlayerDragRulers((drags) => ports.showPlayerDrags?.(drags));
  }

  /** The tokens the party sees: what players act with is looked up in its lists, which hold every token any player's picture holds. */
  get tokens(): TokenShare {
    return this.pictures.party.tokens;
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
    void this.pictures.stop();
    this.moves.stop();
    this.doors.stop();
    this.marks.stop();
    this.dragRulers.clear();
  }

  /** The scene, its tokens and its inputs again, to one player or to all. */
  resend(to?: string): void {
    this.ports.send({ t: 'scene', scene: this.scene }, to);
    this.pictures.resend(to);
    this.rules.resend(to);
    this.marks.resend(to);
  }

  /** A player's map shows again: they are sent the marks as they are now, also where there are none, so none they held stays. */
  catchUpMarks(to: string): void {
    this.marks.catchUp(to);
  }

  /** The player whose drag holds a token on this floor (by GM token id), or undefined while none does. */
  draggerOf(tokenId: string): string | undefined {
    return this.moves.draggerOf(tokenId);
  }

  /** Who owns which token, which tokens are player tokens, or who is connected changed. */
  ownersChanged(): void {
    this.pictures.ownersChanged();
  }

  /** A player left the table or this floor: their drags end where their tokens are, and their marks go. */
  playerLeft(player: string): void {
    this.moves.playerLeft(player);
    this.doors.playerLeft(player);
    this.marks.playerLeft(player);
    this.drawings.playerLeft(player);
    this.pictures.playerLeft(player);
  }

  /** Assets players were handed may no longer be stored: the map and the art are read again, and what the store does not keep goes. */
  refreshAssets(): void {
    // The same scene, its references made again: players keep what they drew of it.
    this.keepId = this.scene?.id ?? null;
    this.key = null;
    this.pictures.refreshAssets();
    void this.update(this.store.getState());
  }

  /** Withdraws the scene: players see none until a scene is shared again. */
  withdraw(): void {
    this.key = null;
    this.publish(null, null);
  }

  /** The GM's canvas shows another floor now, or this one again: what it draws of players' marks starts afresh. */
  viewChanged(): void {
    this.marks.update();
    this.dragRulers.clear();
  }

  /**
   * A player's message on this floor: a drag, drop or cancelled drag of their own token, a laser,
   * measurement or cursor, a request of their Draw tool or the drawing they are making, or a resync.
   */
  receive(from: string, message: PlayerMessage): void {
    if (message.t === 'move') return this.moves.receive(from, message);
    if (message.t === 'drag') return this.moves.drag(from, message);
    if (message.t === 'drag-cancel') return this.moves.dragCancel(from, message);
    if (message.t === 'door-ask' || message.t === 'bump') return this.doors.receive(from, message);
    if (message.t === 'laser' || message.t === 'measure' || message.t === 'cursor' || message.t === 'stroke') return this.marks.receive(from, message);
    if (message.t === 'measure-keep' || message.t === 'measure-drop') return this.measures.receive(from, message);
    if (message.t === 'draw-points' || message.t === 'draw-add' || message.t === 'draw-text' || message.t === 'draw-change' || message.t === 'draw-remove' || message.t === 'draw-erase') {
      this.dealing = true;
      try {
        return this.drawings.receive(from, message);
      } finally {
        this.dealing = false;
      }
    }
    if (message.t === 'resync') this.pictures.resync(from, message);
  }

  /** The GM id of a token by the id players know it by in the list of `scene`, while that is the scene of the last list they were sent. */
  listedToken(scene: string, alias: string): string | undefined {
    return scene === this.tokens.listedScene ? this.tokens.listedToken(alias) : undefined;
  }

  /** The readable pin `player` knows as `alias` in the scene `sceneId`, while they see it now; null for any other. */
  readablePin(player: string, sceneId: string, alias: string): (ListedPin & { readonly map: string }) | null {
    return this.pictures.of(player).layers.readablePin(sceneId, alias);
  }

  /** What players see of the map beside its tokens may have changed. */
  layersChanged(): void {
    this.pictures.layersChanged();
  }

  /** The tokens among `tokenIds` the party of this floor sees now, while it shows `mapPath`. */
  shown(mapPath: string, tokenIds: readonly string[]): ReadonlyMap<string, ShownRollToken> {
    if (this.store.getState().mapPath !== mapPath) return new Map();
    return this.ports.tokenSource()?.playerRollTokens(mapPath, tokenIds) ?? new Map();
  }

  /** The players of this floor whose picture shows `tokenId` now, while it shows `mapPath`. */
  seers(mapPath: string, tokenId: string): string[] {
    return this.store.getState().mapPath === mapPath ? this.pictures.seers(mapPath, tokenId) : [];
  }

  /** Looks again every `TOKEN_POLL_MS`: the map's measurement may change without a store change. */
  private schedulePoll(): void {
    this.poll = this.ports.setTimer(() => {
      this.poll = undefined;
      void this.update(this.store.getState());
      this.rules.update();
      // Who may draw, a character's dice set and Shared vision change at any time: who is told what follows.
      this.pictures.poll();
      this.marks.update();
      this.schedulePoll();
    }, TOKEN_POLL_MS);
  }

  private async update(state: SceneState): Promise<void> {
    if (!state.mapLoaded || state.isMapLoading) return this.pictures.mapLoading();
    const cleared = this.cleared.look(state);
    // Not what a player's own request removed, and not what an undo took back.
    if (cleared.size > 0 && !this.dealing && !isHistoryTravelling(this.store)) this.marks.dropStrokes(cleared);
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
      this.dragRulers.update(state, this.moves.dragStarts());
      return this.pictures.update();
    }
    this.key = key;
    this.pictures.clear();
    const built = await readFloorImages((path) => this.ports.readImage(path), background, this.ports.stored);
    if (this.key !== key) return;
    if (built === null) {
      this.ports.notice(t('online.mapUnreadable'));
      this.publish(null, null);
      return;
    }
    // A map the store does not keep is not shown: the scene goes without it, its tokens on its size.
    if (built.tooLarge) this.ports.notice(t('online.assetsMapTooLarge'));
    const video = built.map === null ? null : await readFloorVideo(this.ports.stored, background, videoMimeOf);
    if (this.key !== key) return;
    // The image's own size goes with its map, so players see where the map lies before its art arrives
    const size = built.map === null ? null : parseImageSize(built.size);
    const scene: SharedScene = { id: this.keepId ?? this.ports.randomId(), map: built.map, lit, ...(floor !== undefined && { floor }), ...placement, ...(size !== null && { size }), ...(video !== null && { video: video.ref }) };
    this.keepId = null;
    this.publish(scene, built.size && floorWorldSize(state, level, built.size));
  }

  private publish(scene: SharedScene | null, size: MapSize | null): void {
    this.scene = scene;
    this.mapSize = size;
    this.moves.sceneChanged();
    this.doors.stop();
    this.dragRulers.clear();
    this.pictures.clear();
    this.rules.setScene(null);
    this.drawings.setScene(scene?.id ?? null);
    this.cleared.reset();
    // Marks of the scene before must not follow the new one: the live lane would let them overtake it.
    this.marks.setScene(null);
    this.pictures.assign();
    this.resend();
    this.pictures.setScene(scene);
    this.rules.setScene(scene?.id ?? null);
    this.marks.setScene(scene?.id ?? null);
  }
}
