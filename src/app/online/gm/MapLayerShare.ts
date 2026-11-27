import type { DrawMine, SharedLiquid } from '../protocol/index.ts';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { ViewState } from '../../types/viewState';
import { ArtRefs } from './artRefs.ts';
import type { AssetStoring } from './assets/assetUses.ts';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import { AnnotationTelling } from './annotationTelling.ts';
import type { MaskDecoder } from './exploredMaskAlpha.ts';
import { Feed, type FeedPorts, type FeedScene } from './feed/Feed.ts';
import type { FeedOut } from './feed/feedOutbox.ts';
import { sharedInitiative } from './initiativeInputs.ts';
import { sharedDoors, sharedGrid, type ToldAbove, type ToldAnnotationLists } from './mapLayerInputs.ts';
import type { MapSize } from './moveCheck.ts';
import { ReadablePins, type ListedPin } from './pins/ReadablePins.ts';
import { SharedLiquids } from './sharedLiquids.ts';
import type { VaultImage } from './TokenShare.ts';
import { WidgetShare } from './WidgetShare.ts';
import { levelObjects } from '../../levels/levelObjects';
import { levelMapKey } from '../../levels/sceneLevels';
import { mapTokens } from '../../tokens/offMap';
import type { AtlasInputs } from './sceneSignal.ts';
import type { NotePin } from '../../types';

export interface MapLayerSharePorts extends FeedPorts {
  /** What the shared tab's renderer tells of grid, doors, sensed tokens and collection, or null while it has none. */
  mapLayers(): MapLayerSource | null;
  /** Atlas as of its last change: its settings say what players are shown of the initiative list and the widgets. */
  atlas(): Pick<AtlasInputs, 'settings'>;
  readImage(path: string): Promise<VaultImage | null>;
  /** How players are handed assets the store keeps for them. */
  stored?: AssetStoring | undefined;
  /** A new alias: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** The log entry that tells who found the pin `pinId` of the map `mapPath`, or null while nobody has. */
  foundPin?(mapPath: string, pinId: string): string | null;
  /** The shared map's pins (of the level shown) whenever the GM changed them, and once for each scene shared. */
  pinsChanged?(mapPath: string, pins: Readonly<Record<string, NotePin>>): void;
  /** The number a token's look-alike badge shows the players (`TokenShare.badgeOf`); none without. */
  badgeOf?(tokenId: string): number | null;
  /** The id players know a token by in their token list (`TokenShare.listedAlias`); none for a token they are not sent. */
  tokenAlias?(tokenId: string): string | undefined;
  /**
   * Which of the drawings and texts players are told are each player's own (`PlayerDrawings.mine`), for
   * every player who is told so now; none while players may not draw. Without it nobody is told.
   */
  drawnBy?(above: ToldAbove): ReadonlyMap<string, Pick<DrawMine, 'drawings' | 'texts' | 'seen'>>;
  /** The size of the floor's map, which the players' memory lies over; null while it is unknown. Without it nothing on the map is known by memory. */
  map?(): MapSize | null;
  /** Reads a saved explored memory; without it nothing on the map is known by memory, only by sight. */
  decodeMask?: MaskDecoder | undefined;
  /** The explored memory these players remember (a data URL), or null for none; without it, the memory the GM saved of the floor. */
  memoryMask?: (() => string | null) | undefined;
}

const NO_PINS: Readonly<Record<string, NotePin>> = Object.freeze({});

/** The shortest time between two sends of the map's layers, as for the token list. */
export const MAP_LAYER_INTERVAL_MS = 66;
/**
 * How fast the drawings and texts go out, in bytes a second: every change of one of them tells
 * the whole list to everyone, so after a list the next waits for as long as this rate takes to
 * carry it. A short list is held by the layers' own pace alone; a level full of drawings goes out
 * a few times a second however many requests players make.
 */
export const ANNOTATION_BYTES_PER_SECOND = 256_000;
/** The longest a list waits for the one before it, however long that was: a player's request is answered by the list that follows it. */
export const ANNOTATION_WAIT_MAX_MS = 2_000;

type LayerState = SceneState & Partial<Pick<ViewState, 'initiative' | 'initiativeTrackerOpen'>>;

/**
 * What players see of the map beside its tokens, fog and lighting, sent to all whenever it changes, at
 * most every `MAP_LAYER_INTERVAL_MS`: the grid, the water, lava and acid that move on the map (part of
 * the map's picture, under its lighting and fog, so all of the floor's), the drawings and texts that fog does not cover whole
 * (of those on the map, in a scene players see by their tokens' sight, only what they have seen or remember a part of: `KnownOnMap`),
 * the initiative list, the widgets (`WidgetShare`) and, in a lit scene, the badges of the doors they see and the outlines of the
 * tokens they only sense. Of the pins only those the GM made readable, where the players see the map
 * (`ReadablePins`); every other pin is the GM's alone and never sent.
 */
export class MapLayerShare {
  readonly feed: Feed;
  private readonly fog = new FogCoverageCache();
  private readonly art: ArtRefs;
  private readonly widgets: WidgetShare;
  private readonly pins: ReadablePins;
  /** What players are told of the drawings and texts. */
  private readonly annotations: AnnotationTelling;
  /** Before when the drawings and texts do not go out again, and the timer that looks again then. */
  private annotationsAfter = Number.NEGATIVE_INFINITY;
  private annotationsTimer: number | undefined;
  /** The drawings and texts players were last sent, as text, and the number that message had among the scene's. */
  private annotationsSent: { readonly value: ToldAnnotationLists; readonly text: string; readonly rev: number } | null = null;
  private readonly liquids: SharedLiquids;
  private liquidsSent: readonly SharedLiquid[] | null = null;
  private pinsSeen: Readonly<Record<string, NotePin>> | null = null;

  constructor(private readonly store: SceneStore, private readonly ports: MapLayerSharePorts) {
    this.annotations = new AnnotationTelling({ now: () => ports.now(), map: () => ports.map?.() ?? null, decodeMask: ports.decodeMask, memory: ports.memoryMask, changed: () => this.update() });
    this.art = new ArtRefs((path) => ports.readImage(path), () => this.update(), ports.stored);
    this.pins = new ReadablePins(() => ports.randomId());
    this.liquids = new SharedLiquids(() => ports.randomId());
    this.widgets = new WidgetShare(store, { ...ports, showWidgets: () => ports.atlas().settings.showWidgets });
    this.feed = new Feed(ports, {
      interval: MAP_LAYER_INTERVAL_MS,
      parts: [this.widgets.feed],
      build: (scene, out) => this.build(scene, out),
      reset: (scene) => this.reset(scene),
      opened: () => this.update(),
    });
  }

  /** Works the layers out again; they go out now, or once the interval has passed. */
  update(): void {
    this.feed.update();
    this.widgets.update();
  }

  /** The committed fog of the floor as it is now, which drawings are judged by; null while it cannot be read. */
  committedFog(): FogCoverage | null {
    const state = this.store.getState();
    return this.fog.get(levelObjects(state).fog, levelMapKey(state.mapPath, state));
  }

  /** Reads every portrait again: its reference may go out another way now (without a stored id). */
  refreshArt(): void {
    this.art.clear();
    this.update();
  }

  private reset(scene: FeedScene | null): void {
    this.annotations.setScene(scene?.id ?? null);
    this.annotationsSent = null;
    this.annotationsAfter = Number.NEGATIVE_INFINITY;
    if (this.annotationsTimer !== undefined) this.ports.clearTimer(this.annotationsTimer);
    this.annotationsTimer = undefined;
    this.liquids.clear();
    this.liquidsSent = null;
    this.art.clear();
    this.pins.clear();
    this.pinsSeen = null;
    this.fog.reset();
  }

  private build(scene: FeedScene, out: FeedOut): void {
    const state: LayerState = this.store.getState();
    const source = this.ports.mapLayers();
    if (source === null || !state.mapLoaded || state.isMapLoading) return;
    const { settings } = this.ports.atlas();
    out.send({ t: 'grid', scene: scene.id, grid: sharedGrid(source.grid()) });
    this.publishLiquids(scene.id, levelObjects(state).liquids, out);
    const fog = this.fog.get(levelObjects(state).fog, levelMapKey(state.mapPath, state));
    this.publishAnnotations(scene, state, fog, source, out);
    const list = sharedInitiative({
      state, shown: settings.showInitiative, showNames: settings.showNames, fromTurn: settings.initiativeFromTurn === true, rules: source.rules(), presets: source.presets(),
      bannerOff: settings.turnBanner === false, movesOnTurn: settings.movesOnTurn === true, dock: settings.initiativeDock ?? 'right',
      badge: (tokenId) => this.ports.badgeOf?.(tokenId) ?? null,
      tokenAlias: (tokenId) => this.ports.tokenAlias?.(tokenId),
      art: (path) => this.art.get(path),
    });
    out.send({ t: 'initiative', scene: scene.id, list });
    this.tellPins(state);
    const pins = this.readablePins(state, source, fog);
    if (pins !== null) out.send({ t: 'pins', scene: scene.id, pins: this.pins.shared(pins, (pinId) => this.ports.foundPin?.(state.mapPath ?? '', pinId) ?? null) });
    if (!scene.lit) return;
    const seen = source.doorsSeen(levelObjects(state).walls, fog);
    if (seen !== null) out.send({ t: 'doors', scene: scene.id, doors: sharedDoors(levelObjects(state).walls, seen) });
    const sensed = source.sensed(mapTokens(levelObjects(state)));
    if (sensed !== null) out.send({ t: 'sensed', scene: scene.id, tokens: sensed });
  }

  /**
   * The readable pin players know as `alias` in the scene `sceneId`, while they see it now; null for
   * any other, and while the scene is not shared, loads or its layers cannot be read.
   */
  readablePin(sceneId: string, alias: string): (ListedPin & { readonly map: string }) | null {
    const state: LayerState = this.store.getState();
    const source = this.ports.mapLayers();
    const map = state.mapPath;
    if (this.feed.scene?.id !== sceneId || source === null || map === null || !state.mapLoaded || state.isMapLoading) return null;
    const listed = this.readablePins(state, source, this.fog.get(levelObjects(state).fog, levelMapKey(map, state)))?.find((pin) => pin.alias === alias);
    return listed === undefined ? null : { ...listed, map };
  }

  private readablePins(state: SceneState, source: MapLayerSource, fog: FogCoverage | null): ListedPin[] | null {
    return this.pins.listed(state, { lit: this.feed.scene?.lit === true, fog, seen: (points) => source.pointsSeen(points, fog) });
  }

  /** Tells of the shown level's pins when they are not the ones last told of. */
  private tellPins(state: SceneState): void {
    const pins = levelObjects(state).pins ?? NO_PINS;
    if (pins === this.pinsSeen) return;
    this.pinsSeen = pins;
    this.ports.pinsChanged?.(state.mapPath ?? '', pins);
  }

  /**
   * Sends the drawings and texts when they say another thing than the last message did, numbered
   * among the scene's (`rev`), and then tells each player who draws which of them are theirs: by
   * their places in that very message, so it follows every one of them, and whenever what is a
   * player's or the last of their requests dealt with is another. A list is not followed by the
   * next sooner than its size allows (`ANNOTATION_BYTES_PER_SECOND`): what changed meanwhile goes
   * out as one.
   */
  private publishAnnotations({ id: scene, lit }: FeedScene, state: SceneState, fog: FogCoverage | null, source: MapLayerSource, out: FeedOut): void {
    const told = this.annotations.lists(state, fog, lit, source);
    // Not everything on the map could be asked about in one look: the next goes on.
    if (this.annotations.pending) this.feed.update();
    let sent = this.annotationsSent;
    // Drawings may run to megabytes: they are compared as text only when worked out anew.
    if (sent === null || told !== sent.value) {
      const now = this.ports.now();
      if (sent !== null && now < this.annotationsAfter) return this.lookAgain(this.annotationsAfter - now);
      const text = JSON.stringify(told.shared);
      const rev = sent === null ? 1 : text === sent.text ? sent.rev : sent.rev + 1;
      if (rev !== sent?.rev) {
        out.send({ t: 'annotations', scene, rev, ...told.shared });
        this.annotationsAfter = now + Math.min(ANNOTATION_WAIT_MAX_MS, (text.length / ANNOTATION_BYTES_PER_SECOND) * 1000);
      }
      sent = this.annotationsSent = { value: told, text, rev };
    }
    const mine = this.ports.drawnBy?.(told.above) ?? new Map<string, Pick<DrawMine, 'drawings' | 'texts' | 'seen'>>();
    out.keepOnly(mine);
    for (const [player, own] of mine) out.to(player, { t: 'draw-mine', scene, rev: sent.rev, ...own });
  }

  /** Works the layers out again in `wait` ms, when the drawings and texts may go out again. */
  private lookAgain(wait: number): void {
    if (this.annotationsTimer !== undefined) return;
    this.annotationsTimer = this.ports.setTimer(() => {
      this.annotationsTimer = undefined;
      this.update();
    }, Math.max(1, Math.ceil(wait)));
  }

  /**
   * The floor's surfaces, compared as text only when worked out anew (they may run to megabytes); none
   * are said of a floor that has had none, so older pages and maps without liquids cost no message.
   */
  private publishLiquids(scene: string, record: Parameters<SharedLiquids['of']>[0], out: FeedOut): void {
    const liquids = this.liquids.of(record);
    if (liquids === this.liquidsSent || (liquids.length === 0 && !out.has('liquids'))) return;
    this.liquidsSent = liquids;
    out.send({ t: 'liquids', scene, liquids });
  }
}
