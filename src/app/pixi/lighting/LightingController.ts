import type { FogCoverage } from '../../fog/fogCoverage';
import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import type { Application, Texture } from 'pixi.js';
import type { UnlitGrid } from '../../grid/gridLightingMark';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { AssetService } from '../../services/AssetService';
import { mapLightPresets } from '../../services/mapCollectionRules';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import { heldForSight } from '../../lighting/sightOnDrop';
import { CreatureIndex } from '../../creatures/CreatureIndex';
import { tokenSensesResolver, type TokenSensesResolver } from '../../creatures/tokenSensesResolver';
import { mapSenseRulesSource } from '../../services/mapSenseRules';
import type { ViewAtlasStore } from '../../storeFactory';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer, LayerVisibility } from '../playerSafeFrame';
import { requestRender } from '../RenderScheduler';
import type { TokenRenderer } from '../TokenRenderer';
import { createSceneLighting } from './createSceneLighting';
import { GmSightAids } from './GmSightAids';
import { DoorIcons } from './DoorIcons';
import { showDoorMenu, showWallMenu, type LightingMenuContext } from './lightingMenus';
import { wireLightingPointer } from './lightingPointer';
import { listenToLightingSceneEvents } from './lightingSceneEvents';
import { LightInteraction } from './LightInteraction';
import { LightMarkers } from './LightMarkers';
import { LightRangeRings } from './LightRangeRings';
import { LightingModes } from './LightingModes';
import { showExploredTravelNotice, showZonesFullNotice } from './lightingNotices';
import { closeStalePopovers } from './popoverGuards';
import { playerDoorSight, playerLightingLayers, playerTokenSight, type GmOverlays } from './playerLightingLayers';
import { PerceptionMemo, type TokenPerception } from '../../vision/tokenPerception';
import type { SceneLightingView } from './sceneLightingView';
import { SessionLighting } from './SessionLighting';
import { SightRulesWatch } from './SightRulesWatch';
import { WallEditor } from './WallEditor';

export interface LightingControllerDeps {
  viewport: Viewport;
  app: Application;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  obsApp: App;
  viewId: string;
  bounds: () => MapBounds | null;
  /** The map image, for the colours light bounces off. */
  albedo: () => Texture | null;
  /** The grid the composite draws unlit, while there is one (`UnlitGrid`). */
  grid?: () => UnlitGrid | null;
  /** How each token perceives; unset, by its own vision and its linked statblock (`tokenSensesResolver`). */
  senses?: TokenSensesResolver;
  /** Committed fog for the current map; null when its geometry is invalid. */
  fogCoverage?: () => FogCoverage | null;
}

/**
 * Walls, lights and scene lighting for one map view: owns the lighting renderer, the wall editor, the tool's
 * zone and memory modes and the GM's overlays (door badges, light markers, the open light's range rings, the sight aids), and routes
 * the pointer to them. Walls follow the map's artwork, never the grid. In session view and while
 * the peek key is held, the canvas shows the players' lighting (`SessionLighting`): the GM's
 * overlays are hidden then, and take no input.
 */
export class LightingController {
  readonly renderer: SceneLightingView;
  /** What tells the GM how the rules of sight apply: sense ranges and marks on unseen tokens. */
  readonly sightAids: GmSightAids;
  private readonly editor: WallEditor;
  private readonly modes: LightingModes;
  private readonly doors: DoorIcons;
  private readonly lightMarkers: LightMarkers;
  private readonly rangeRings: LightRangeRings;
  private readonly lights: LightInteraction;
  private readonly session: SessionLighting;
  private readonly cleanups: Array<() => void> = [];
  private tokens: TokenRenderer | null = null;
  /** What the players perceive of each token, kept between frames while sight and light stay. */
  private readonly perceptions = new PerceptionMemo();
  /** The sight rules of the map's collection; sight is worked out anew when they differ. */
  private readonly rules: SightRulesWatch;
  /**
   * Every part exists. The lighting view builds a scene that is already loaded while it is
   * constructed (lighting switched on for an open map) and reports its sight then, before the
   * door badges and the sight aids are there: that report is made up for once they are.
   */
  private constructed = false;

  constructor(private readonly deps: LightingControllerDeps) {
    const { viewport, app, store, eventBus, obsApp } = deps;
    const assetService = AssetService.getInstance(obsApp);
    const measurement = (): MeasurementSettings => mapMeasurementSettings(assetService, store.getState());
    this.rules = new SightRulesWatch({
      obsApp,
      store,
      senses: deps.senses ?? tokenSensesResolver(CreatureIndex.forApp(obsApp), mapSenseRulesSource(obsApp, assetService, () => store.getState())),
      frames: () => this.frames(),
      // Rebuilds the scene from the store, as after a new map image.
      onChange: () => this.renderer.refreshBounds(),
    });
    this.modes = new LightingModes({
      viewport, canvas: app.canvas, store, eventBus, bounds: deps.bounds, edit: (edit) => this.renderer.editExplored(edit),
      onActiveChange: () => this.session.sync(), onFull: showZonesFullNotice, announce: showExploredTravelNotice,
    });
    this.renderer = createSceneLighting({
      viewport, app, store, obsApp, measurement, bounds: deps.bounds, albedo: deps.albedo, ...(deps.grid && { grid: deps.grid }),
      rules: () => this.sightRules(),
      onSightChange: () => this.onSightChange(),
      exploredWatcher: this.modes.memory,
    });
    this.sightAids = new GmSightAids({
      viewport, store, measurement, bounds: deps.bounds,
      rules: () => this.sightRules(),
      perception: () => this.playerSight(),
      frames: () => this.frames(),
    });
    this.lightMarkers = new LightMarkers(viewport, store);
    this.rangeRings = new LightRangeRings(viewport, store, measurement);
    this.editor = new WallEditor(viewport, store, eventBus, (lightIds) => this.lightMarkers.setSelected(lightIds), () => mapLightPresets(obsApp, store.getState()));
    this.doors = new DoorIcons(store, app.canvas, () => playerDoorSight(this.renderer, store.getState().objects.walls, deps.fogCoverage?.()));
    viewport.addChild(this.doors.view, this.doors.playerView);
    this.lights = new LightInteraction({
      viewport,
      canvas: app.canvas,
      store,
      markers: this.lightMarkers,
      rings: this.rangeRings,
      canMove: () => this.editor.shown,
      select: (lightId, add) => this.editor.walls.selectLight(lightId, add),
    });
    this.session = new SessionLighting({
      store,
      playerLayers: () => this.playerLayers(),
      gmLayers: () => this.gmLayers(),
      onChange: () => this.afterLayerSync(),
    });
    // Subscribed after the overlays' own subscriptions, so the players' view is set last.
    this.cleanups.push(store.subscribe((state, previous) => {
      if (state.activeTool !== previous.activeTool || state.lighting.enabled !== previous.lighting.enabled) this.session.sync();
      closeStalePopovers(state);
    }));
    this.listen();
    this.session.sync();
    this.constructed = true;
    this.onSightChange();
  }

  /** Routes the pointer from the token renderer's dispatch: lights and door badges with any tool, walls with the lighting tool. */
  wire(tokens: TokenRenderer): void {
    this.tokens = tokens;
    tokens.setPlayerSightProvider(() => (this.session.active ? this.playerSight() : undefined), () => this.session.active, () => this.renderer.sightIsCurrent());
    wireLightingPointer(tokens, {
      lights: this.lights, editor: this.editor, modes: this.modes, doors: this.doors,
      wallMenu: (x, y, screenX, screenY) => showWallMenu(this.menuContext(), x, y, screenX, screenY),
      doorMenu: (doorId, screenX, screenY) => showDoorMenu(this.deps.store, doorId, screenX, screenY),
    });
    // The token renderer brings the outlines of sensed tokens, which the view now shows or hides.
    this.session.sync();
  }

  gmOverlays(): GmOverlays {
    return {
      wallEditor: this.editor.layer, ...this.modes.views, doorBadges: this.doors.view, lightMarkers: this.lightMarkers.view,
      rangeRings: this.rangeRings.view, sightAids: this.sightAids.view,
    };
  }

  /** What only the players' view shows of the lighting: a picture of the scene, always the GM's, leaves it out. */
  readonly playerOnlyLayers = (): HideableLayer[] => [this.doors.playerView];

  /** What the players' view changes about the lighting: for their frame, and held in session view. */
  playerLayers(): LayerVisibility[] {
    return playerLightingLayers({
      enabled: this.renderer.isEnabled(),
      modeLayer: this.renderer.modeLayer,
      gmOverlays: this.gmOverlays(),
      sensedOutlines: this.tokens?.getSensedOutlineLayer(),
      playerDoorBadges: this.doors.playerView,
    });
  }

  /** How the players perceive each token, for their frame and for session view; sight hides nothing in an unlit scene. */
  playerSight(): TokenPerception | undefined {
    const state = this.deps.store.getState();
    return playerTokenSight(this.renderer, state.objects.tokens, { conditions: this.sightRules().conditions, held: heldForSight(state) }, this.perceptions);
  }

  /** The senses and conditions of the map's collection, and how each token perceives. */
  private sightRules(): SightRules {
    return this.rules.current();
  }

  /** The window the canvas is in: a popout has its own frames. */
  private frames(): Window {
    return this.deps.app.canvas.ownerDocument?.defaultView ?? window;
  }

  /** Escape cancels a light or ring being dragged and closes the light popover; else it is the tool's zone or memory mode's, or the wall editor's. */
  handleEscape(): boolean {
    const state = this.deps.store.getState();
    const dragging = this.lights.dragging;
    if (!dragging && !state.lightPopover) return this.modes.handleEscape() || this.editor.handleEscape();
    this.lights.cancel();
    state.closeLightPopover();
    return true;
  }

  handleDelete(): boolean {
    return this.modes.handleDelete() || this.editor.handleDelete();
  }

  /** Enter closes the light zone being drawn. */
  handleEnter(): boolean {
    return this.modes.handleEnter();
  }

  private menuContext(): LightingMenuContext {
    return {
      store: this.deps.store,
      walls: this.editor.walls,
      doors: this.editor.doors,
      wallRenderer: this.editor.renderer,
      lightAt: (x, y) => this.lightMarkers.hitTest(x, y),
    };
  }

  /**
   * The layers the players' view changes, as the GM sees them. The light markers, the range
   * rings and the sight aids show by their own rules and follow `setSuppressed`.
   */
  private gmLayers(): LayerVisibility[] {
    const { activeTool, lighting } = this.deps.store.getState();
    const tool = activeTool === 'wall';
    const outlines = this.tokens?.getSensedOutlineLayer();
    return [
      { layer: this.renderer.modeLayer, visible: false },
      ...(outlines ? [{ layer: outlines, visible: false }] : []),
      { layer: this.editor.layer, visible: tool },
      ...this.modes.layers(tool),
      ...this.doors.gmLayers(tool || lighting.enabled),
    ];
  }

  private afterLayerSync(): void {
    const players = this.session.active;
    this.lightMarkers.setSuppressed(players);
    this.rangeRings.setSuppressed(players);
    this.sightAids.setSuppressed(players);
    if (players) this.lights.cancel();
    this.editor.afterVisibilityChange();
    this.modes.afterVisibilityChange();
    this.tokens?.refreshPlayerSight();
    requestRender(this.deps.app);
  }

  /** In the players' view, tokens show and hide as the sight they are checked against changes; in the GM's, the sight aids follow. The players' door badges follow in both. */
  private onSightChange(): void {
    if (!this.constructed) return;
    this.doors.refreshPlayers();
    if (this.tokens && this.session.active) this.tokens.refreshPlayerSight();
    else this.sightAids.schedule();
  }

  private listen(): void {
    const { eventBus, store, obsApp, viewId } = this.deps;
    this.cleanups.push(() => this.rules.destroy(), ...listenToLightingSceneEvents({
      eventBus, obsApp, viewId,
      resetExplored: () => this.renderer.resetExplored(),
      revealExplored: () => this.renderer.editExplored({ mode: 'reveal', area: 'everything' }),
      peek: (held) => {
        // A light is not edited in the players' view: the peek closes its popover, as session view does.
        if (held) store.getState().closeLightPopover();
        this.session.setPeeking(held);
      },
      stopEditing: () => this.stopEditing(),
      beforeMapUnload: () => this.beforeMapUnload(),
    }));
  }

  private stopEditing(): void {
    this.lights.cancel();
    this.modes.stop();
    this.deps.store.getState().closeLightPopover();
  }

  private beforeMapUnload(): void {
    this.editor.cancelDrawing();
    this.renderer.beforeMapUnload();
  }

  /** Taken off a map that stays open: what is being edited ends and what is pending is saved, as before an unload. */
  remove(): void {
    this.stopEditing();
    this.beforeMapUnload();
    this.destroy();
    this.tokens?.clearLighting();
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    for (const part of [this.session, this.lights, this.editor, this.modes, this.renderer, this.doors, this.rangeRings, this.lightMarkers, this.sightAids]) part.destroy();
  }
}
