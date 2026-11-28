import type { App } from 'obsidian';
import type { Container, Renderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { UnderWaySource } from '../../annotations/underWay';
import type { CollectionLookup } from '../../gameSystems/mapRules';
import type { MapRect } from '../../grid/cellNumbering';
import type { GridOptions } from '../../grid/GridSystem';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { SceneSource } from '../../host/sceneSource';
import type { AreaMap } from '../../measure/areaOnMap';
import type { CanvasAudience } from '../../pixi/audience/CanvasAudience';
import type { SceneLightingView } from '../../pixi/lighting/sceneLightingView';
import type { Measurements } from '../../pixi/measure/measurements';
import type { MosaicCanvas } from '../../pixi/mosaicCanvas/MosaicCanvas';
import type { DragRulerPath } from '../../pixi/token-renderer/DragRuler';
import type { HeldPlayout } from '../../pixi/token-renderer/TokenPlaces';
import type { TokenGroupContainer } from '../../pixi/token-renderer/types';
import type { ShownRollToken } from '../../services/playerRollSource';
import type { ViewAtlasState } from '../../storeFactory';
import type { DiceTool } from '../../tools/DiceTool';
import type { EventEmitter } from '../../utils/typedEmitter';
import type { TokenPerception } from '../../vision/tokenPerception';
import type { LightingSource } from './atlasLighting.ts';
import type { ObservedStore, SceneState } from './atlasView.ts';
import type { TokenMoves } from './moveShare.ts';
import type { TabSource } from './presentedScene.ts';
import type { TokenRules } from './tokenUI.ts';

/*
 * What the online table reads of an Atlas map view (`AtlasView`) and its canvas (`PixiRendererOrchestrator`).
 * `mapViewOf` hands out the view itself as a `MapView`, so the compiler holds every name here to Atlas's own:
 * one renamed there breaks the build. The view and its canvas are the objects themselves, so a tab is the same
 * tab while they are the same objects.
 */

/** A token's sprite as the canvas draws it now: where, and how large. */
export type DrawnToken = Pick<TokenGroupContainer, 'x' | 'y' | 'tokenSize'>;

/** The canvas's token renderer (`TokenRenderer`): the players' frame of the tokens and where each is drawn. */
export interface MapTokens {
  /** How the players' frame shows each token, given what the players perceive by the lighting (none while unlit): under committed fog and the roof drawn. */
  playerFramePerception(lighting?: TokenPerception): TokenPerception | undefined;
  /** Each token's sprite by id; null for one whose sprite is not made yet. */
  getTokenSprites(): Readonly<Record<string, DrawnToken | null>>;
  /** The map's resource and condition definitions the tokens are drawn by. */
  collectionRules(): { readonly [Rule in keyof TokenRules]: () => TokenRules[Rule] };
  tokenMovement(): TokenMoves;
  dragRulerPath(): DragRulerPath | null;
  /** How tokens someone else holds are drawn; null glides them to each place. */
  setHeldPlayout(playout: HeldPlayout | null): void;
  bumpToken(tokenId: string, dx: number, dy: number): void;
}

/** The canvas's lighting (`LightingController`), there for a lit scene's view. */
export interface MapLighting {
  readonly renderer: Pick<SceneLightingView, 'isEnabled' | 'sightIsCurrent' | 'currentSight' | 'ambientLight' | 'lightReaches'>;
  /** How the players perceive each token by the lighting; undefined on an unlit scene. */
  playerSight(): TokenPerception | undefined;
  /** The rules and measurement the GM's lighting works the scene out by. */
  readonly sightAids: LightingSource;
}

/** The canvas's measure renderer (`MeasureRenderer`). */
export interface MapMeasure {
  /** How the GM's own ruler labels distances; null until the map's rules are known. */
  readonly measurementSettingsProvider: (() => MeasurementSettings) | null;
  /** The map as measured areas are shaped by it: its rules and the walls of the level shown. */
  areaMap(): AreaMap;
  /** The GM's measurements as data. */
  readonly measurements: SceneSource<Measurements>;
}

/** A map view's canvas (`PixiRendererOrchestrator`). */
export interface MapCanvas {
  getGridOptions(): Readonly<GridOptions> | null;
  /** The tokens the players' frame of `mapPath` shows: not hidden, seen, not under fog. */
  playerRollTokens(mapPath: string, tokenIds?: readonly string[]): ReadonlyMap<string, ShownRollToken>;
  getTokenRenderer(): MapTokens | null;
  getLightingController(): MapLighting | null;
  getMeasureRenderer(): MapMeasure | null;
  getAnnotations(): { readonly underWay: UnderWaySource } | null;
  getViewportInstance(): Viewport | null;
  getCanvasElement(): HTMLCanvasElement;
  /** Whom the canvas is drawn for: `onChange` tells of a change of it, `onSightChange` of every change of what players see. */
  getCanvasAudience(): Pick<CanvasAudience, 'onChange' | 'onSightChange'>;
  /** Shows a layer to the players' frame alone. */
  addPlayerFrameLayer(layer: Container): { changed(): void; remove(): void };
  getMapImage(): MosaicCanvas | null;
  getMapRect(): MapRect | null;
  /** The canvas's PIXI application; its renderer is there once the application has started. */
  getAppInstance(): { readonly renderer: Renderer | null | undefined };
}

/** A map view's services, as far as the table reads them. */
export interface MapServices {
  /** Where a map's collection and its settings are looked up; null before the view has one. */
  getAssetService(): CollectionLookup | null;
  /** The view's tools, whose dice tool rolls the table's dice; given none, the table rolls none. */
  getToolController(): { getDiceTool(): Pick<DiceTool, 'rollDice' | 'getDiceRules'> } | null;
  /** The view's bus, on which every roll of the view is announced (`dice-rolled`). */
  getEventBus(): Pick<EventEmitter, 'on' | 'off'>;
}

/** A map view's store, whose level switch the table calls to show the GM a door asked about. */
export interface MapStore extends ObservedStore {
  getState(): SceneState & Pick<ViewAtlasState, 'setViewedLevel'>;
}

/** An Atlas map view (`AtlasView`). */
export interface MapView {
  readonly app: App;
  readonly viewId: string;
  readonly atlasStore: MapStore;
  /** The view's scene tabs. */
  readonly tabMetaStore: TabSource;
  /** The view's canvas, or null before it has one. */
  readonly renderer: MapCanvas | null;
  readonly serviceManager: MapServices;
  /** Whether the view is closing: it is then destroying its services. */
  isClosing(): boolean;
  switchToTab(tabId: string): Promise<void>;
}
