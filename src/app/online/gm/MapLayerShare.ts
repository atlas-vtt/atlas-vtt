import { Pacer, type PacerClock } from '../marks/index.ts';
import type { GmMessage, SharedAnnotations, SharedLiquid } from '../protocol/index.ts';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { ViewState } from '../../types/viewState';
import { ArtRefs } from './artRefs.ts';
import type { AtlasPlayerSettings } from './atlasLighting.ts';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import { sharedInitiative } from './initiativeInputs.ts';
import { sharedAnnotations, sharedDoors, sharedGrid } from './mapLayerInputs.ts';
import { ReadablePins, type ListedPin } from './pins/ReadablePins.ts';
import { SharedLiquids } from './sharedLiquids.ts';
import type { VaultImage } from './TokenShare.ts';
import { WidgetShare } from './WidgetShare.ts';
import { levelObjects } from '../../levels/levelObjects';
import { levelMapKey } from '../../levels/sceneLevels';
import { mapTokens } from '../../tokens/offMap';

export interface MapLayerSharePorts extends PacerClock {
  send(body: GmMessage, to?: string): void;
  /** What the shared tab's renderer tells of grid, doors, sensed tokens and collection, or null while it has none. */
  mapLayers(): MapLayerSource | null;
  atlasSettings(): AtlasPlayerSettings;
  readImage(path: string): Promise<VaultImage | null>;
  /** A new alias: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** The log entry that tells who found the pin `pinId` of the map `mapPath`, or null while nobody has. */
  foundPin?(mapPath: string, pinId: string): string | null;
  /** The number a token's look-alike badge shows the players (`TokenShare.badgeOf`); none without. */
  badgeOf?(tokenId: string): number | null;
  /** The id players know a token by in their token list (`TokenShare.listedAlias`); none for a token they are not sent. */
  tokenAlias?(tokenId: string): string | undefined;
}

/** The shortest time between two sends of the map's layers, as for the token list. */
export const MAP_LAYER_INTERVAL_MS = 66;

type LayerMessage = Extract<GmMessage, { t: 'grid' | 'liquids' | 'doors' | 'sensed' | 'annotations' | 'initiative' | 'pins' }>;
type LayerState = SceneState & Partial<Pick<ViewState, 'initiative' | 'initiativeTrackerOpen'>>;

interface Sent {
  readonly scene: string;
  readonly text: string;
  readonly body: LayerMessage;
}

/** What the drawings and texts were last worked out from. */
interface AnnotationKey {
  readonly drawings: unknown;
  readonly texts: unknown;
  readonly fog: FogCoverage | null;
}

/**
 * What players see of the map beside its tokens, fog and lighting, sent to all whenever it changes, at
 * most every `MAP_LAYER_INTERVAL_MS`: the grid, the water, lava and acid that move on the map (part of
 * the map's picture, under its lighting and fog, so all of the floor's), the drawings and texts that fog does not cover whole,
 * the initiative list, the widgets (`WidgetShare`) and, in a lit scene, the badges of the doors they see and the outlines of the
 * tokens they only sense. Of the pins only those the GM made readable, where the players see the map
 * (`ReadablePins`); every other pin is the GM's alone and never sent.
 */
export class MapLayerShare {
  private readonly store: SceneStore;
  private readonly ports: MapLayerSharePorts;
  private readonly pacer: Pacer;
  private readonly fog = new FogCoverageCache();
  private readonly art: ArtRefs;
  private readonly widgets: WidgetShare;
  private readonly pins: ReadablePins;
  private scene: { readonly id: string; readonly lit: boolean } | null = null;
  private readonly last = new Map<LayerMessage['t'], Sent>();
  private annotations: { readonly key: AnnotationKey; readonly value: SharedAnnotations } | null = null;
  private annotationsSent: SharedAnnotations | null = null;
  private readonly liquids: SharedLiquids;
  private liquidsSent: readonly SharedLiquid[] | null = null;
  /** Vault paths of the portraits the last initiative list shows, by hash. */
  private shownArt = new Map<string, string>();

  constructor(store: SceneStore, ports: MapLayerSharePorts) {
    this.store = store;
    this.ports = ports;
    this.pacer = new Pacer(ports, MAP_LAYER_INTERVAL_MS, () => this.flush());
    this.art = new ArtRefs((path) => ports.readImage(path), () => this.update());
    this.pins = new ReadablePins(() => ports.randomId());
    this.liquids = new SharedLiquids(() => ports.randomId());
    this.widgets = new WidgetShare(store, { ...ports, showWidgets: () => ports.atlasSettings().showWidgets });
  }

  /** The shared scene the layers belong to; null sends none. */
  setScene(scene: { readonly id: string; readonly lit: boolean } | null): void {
    if (scene?.id === this.scene?.id) return;
    this.scene = scene;
    this.last.clear();
    this.annotations = null;
    this.annotationsSent = null;
    this.liquids.clear();
    this.liquidsSent = null;
    this.shownArt = new Map();
    this.art.clear();
    this.pins.clear();
    this.fog.reset();
    this.pacer.cancel();
    this.widgets.setScene(scene?.id ?? null);
    this.update();
  }

  /** Works the layers out again; they go out now, or once the interval has passed. */
  update(): void {
    if (this.scene !== null) this.pacer.request();
    this.widgets.update();
  }

  /** The last layers again, to one player or to all. */
  resend(to?: string): void {
    for (const sent of this.last.values()) if (sent.scene === this.scene?.id) this.ports.send(sent.body, to);
    this.widgets.resend(to);
  }

  /** The vault path of a portrait the players' initiative list shows, by its hash. */
  artPath(hash: string): string | undefined {
    return this.shownArt.get(hash);
  }

  stop(): void {
    this.setScene(null);
  }

  private flush(): void {
    const scene = this.scene;
    const state: LayerState = this.store.getState();
    const source = this.ports.mapLayers();
    if (scene === null || source === null || !state.mapLoaded || state.isMapLoading) return;
    const settings = this.ports.atlasSettings();
    this.publish({ t: 'grid', scene: scene.id, grid: sharedGrid(source.grid()) });
    this.publishLiquids(scene.id, levelObjects(state).liquids);
    const fog = this.fog.get(levelObjects(state).fog, levelMapKey(state.mapPath, state));
    const annotations = this.annotationsOf(state, fog);
    // Drawings may run to megabytes: they are compared as text only when worked out anew.
    if (annotations !== this.annotationsSent) {
      this.annotationsSent = annotations;
      this.publish({ t: 'annotations', scene: scene.id, ...annotations });
    }
    const art = new Map<string, string>();
    const list = sharedInitiative({
      state, shown: settings.showInitiative, showNames: settings.showNames, fromTurn: settings.initiativeFromTurn === true, rules: source.rules(),
      bannerOff: settings.turnBanner === false, movesOnTurn: settings.movesOnTurn === true, dock: settings.initiativeDock ?? 'right',
      badge: (tokenId) => this.ports.badgeOf?.(tokenId) ?? null,
      tokenAlias: (tokenId) => this.ports.tokenAlias?.(tokenId),
      art: (path) => {
        const ref = this.art.get(path);
        if (ref !== null) art.set(ref.hash, path);
        return ref;
      },
    });
    this.shownArt = art;
    this.publish({ t: 'initiative', scene: scene.id, list });
    const pins = this.readablePins(state, source, fog);
    if (pins !== null) this.publish({ t: 'pins', scene: scene.id, pins: this.pins.shared(pins, (pinId) => this.ports.foundPin?.(state.mapPath ?? '', pinId) ?? null) });
    if (!scene.lit) return;
    const seen = source.doorsSeen(levelObjects(state).walls, fog);
    if (seen !== null) this.publish({ t: 'doors', scene: scene.id, doors: sharedDoors(levelObjects(state).walls, seen) });
    const sensed = source.sensed(mapTokens(levelObjects(state)));
    if (sensed !== null) this.publish({ t: 'sensed', scene: scene.id, tokens: sensed });
  }

  /**
   * The readable pin players know as `alias` in the scene `sceneId`, while they see it now; null for
   * any other, and while the scene is not shared, loads or its layers cannot be read.
   */
  readablePin(sceneId: string, alias: string): (ListedPin & { readonly map: string }) | null {
    const state: LayerState = this.store.getState();
    const source = this.ports.mapLayers();
    const map = state.mapPath;
    if (this.scene?.id !== sceneId || source === null || map === null || !state.mapLoaded || state.isMapLoading) return null;
    const listed = this.readablePins(state, source, this.fog.get(levelObjects(state).fog, levelMapKey(map, state)))?.find((pin) => pin.alias === alias);
    return listed === undefined ? null : { ...listed, map };
  }

  private readablePins(state: SceneState, source: MapLayerSource, fog: FogCoverage | null): ListedPin[] | null {
    return this.pins.listed(state, { lit: this.scene?.lit === true, fog, seen: (points) => source.pointsSeen(points, fog) });
  }

  /** The drawings and texts, worked out again only when they or the fog changed. */
  private annotationsOf(state: SceneState, fog: FogCoverage | null): SharedAnnotations {
    const key: AnnotationKey = { drawings: levelObjects(state).drawings, texts: levelObjects(state).texts, fog };
    const known = this.annotations;
    if (known !== null && known.key.drawings === key.drawings && known.key.texts === key.texts && known.key.fog === key.fog) return known.value;
    const value = sharedAnnotations(levelObjects(state).drawings, levelObjects(state).texts, fog);
    this.annotations = { key, value };
    return value;
  }

  /**
   * The floor's surfaces, compared as text only when worked out anew (they may run to megabytes); none
   * are said of a floor that has had none, so older pages and maps without liquids cost no message.
   */
  private publishLiquids(scene: string, record: Parameters<SharedLiquids['of']>[0]): void {
    const liquids = this.liquids.of(record);
    if (liquids === this.liquidsSent || (liquids.length === 0 && !this.last.has('liquids'))) return;
    this.liquidsSent = liquids;
    this.publish({ t: 'liquids', scene, liquids });
  }

  /** Sends a message unless it says what the last of its kind said. */
  private publish(body: LayerMessage): void {
    const scene = this.scene;
    if (scene === null) return;
    const text = JSON.stringify(body);
    const last = this.last.get(body.t);
    if (last?.scene === scene.id && last.text === text) return;
    this.last.set(body.t, { scene: scene.id, text, body });
    this.ports.send(body);
  }
}
