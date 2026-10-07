import { FederatedPointerEvent, Graphics, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { StoreApi } from 'zustand/vanilla';
import { getObsidianAccentColor, cssColorToHexNumber } from "./utils/colorUtils";
import type { GridSystem } from "../grid/GridSystem";
import { pathLengthInCells } from '../grid/gridDistance';
import { formatDistance, resolveMeasurementSettings, type MeasurementSettings } from '../grid/measurementFormat';
import type { SceneSource } from '../host/sceneSource';
import type { ViewState } from '../types/viewState';
import { isHandled } from './utils/handledEvents';
import { createMeasureLabelText, drawMeasureLabel, drawMeasurement, measureLabelFontSize, type MeasureRecord, type MeasureShape } from './utils/measureDrawing';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { MeasurePartsVisibility, type MeasurePlayersView } from './measurePartsVisibility';
import type { LayerVisibility } from './playerSafeFrame';
import type { TokenSeen } from '../vision/measureOrigin';

/** What the measure tool reads of its view's state: the active tool, and the grid's snapping and measurement defaults. */
export type MeasureStore = Pick<StoreApi<Pick<ViewState, 'activeTool' | 'grid'>>, 'getState' | 'subscribe'>;

/** The grid a measurement snaps to and is measured on. */
export type MeasureGrid = Pick<GridSystem, 'getOptions' | 'snapToCellCenter'>;

/** Where the measure tool's options arrive: the shape picked and whether measurements stay on the map. */
export interface MeasureToolEvents {
  on(event: 'measure-shape-changed', listener: (shape: MeasureShape) => void): unknown;
  on(event: 'measure-persistence-changed', listener: (persist: boolean) => void): unknown;
  off(event: 'measure-shape-changed', listener: (shape: MeasureShape) => void): unknown;
  off(event: 'measure-persistence-changed', listener: (persist: boolean) => void): unknown;
}

/** The measurements on the map: the one being drawn (or showing after its release) and those kept there. */
export interface Measurements {
  readonly live: MeasureRecord | null;
  readonly kept: readonly MeasureRecord[];
}

const NO_MEASUREMENTS: Measurements = Object.freeze({ live: null, kept: Object.freeze([]) });

interface PersistentMeasurement {
  graphics: Graphics;
  pill: Graphics;
  text: Text;
}

export class MeasureRenderer {
  private viewport: Viewport;
  private eventBus: MeasureToolEvents;
  private store: MeasureStore;
  private gridSystem: MeasureGrid;
  
  private measureGraphics: Graphics;
  private measureText: Text;
  private measurePill: Graphics; // Background pill for text
  /** Measurement settings of the current map, from its collection when it has one. */
  public measurementSettingsProvider: (() => MeasurementSettings) | null = null;
  /** How the players see the tokens a measurement starts on; without it, the players' picture shows every measurement. */
  public playersView: MeasurePlayersView | null = null;
  private readonly parts: MeasurePartsVisibility;

  private isDrawing: boolean = false;
  private measureShape: MeasureShape = 'line';
  private persistMeasurements: boolean = false;
  private persistentMeasurements: PersistentMeasurement[] = [];
  private current: Measurements = NO_MEASUREMENTS;
  private readonly listeners = new Set<(next: Measurements, previous: Measurements) => void>();

  /** The measurements as data, read-only: the live one and the kept ones, in the order they were kept. */
  public readonly measurements: SceneSource<Measurements> = {
    get: () => this.current,
    subscribe: (listener) => {
      this.listeners.add(listener);
      return () => { this.listeners.delete(listener); };
    },
  };
  
  private pointerDownHandler: (e: FederatedPointerEvent) => void;
  private pointerMoveHandler: (e: FederatedPointerEvent) => void;
  private pointerUpHandler: (e: FederatedPointerEvent) => void;
  private rightClickDownPos: { x: number; y: number } | null = null;
  
  private _unsubscribeFromToolChanges?: () => void;
  private _viewportScaleHandler?: () => void;
  private _measureShapeChangedHandler?: (shape: MeasureShape) => void;
  private _measurePersistenceChangedHandler?: (persist: boolean) => void;

  constructor(
    viewport: Viewport,
    eventBus: MeasureToolEvents,
    store: MeasureStore,
    gridSystem: MeasureGrid
  ) {
    this.viewport = viewport;
    this.eventBus = eventBus;
    this.store = store;
    this.gridSystem = gridSystem;
    
    // Create graphics for drawing measurements
    this.measureGraphics = new Graphics();
    this.measureGraphics.eventMode = 'none';
    this.measureGraphics.interactiveChildren = false;
    this.measureGraphics.zIndex = MAP_LAYER_Z.measure;
    this.viewport.addChild(this.measureGraphics);
    
    // Create graphics for text pill background
    this.measurePill = new Graphics();
    this.measurePill.eventMode = 'none';
    this.measurePill.zIndex = MAP_LAYER_Z.measure;
    this.viewport.addChild(this.measurePill);
    
    this.measureText = createMeasureLabelText();
    this.measureText.zIndex = MAP_LAYER_Z.measure;
    this.viewport.addChild(this.measureText);
    this.parts = new MeasurePartsVisibility({ graphics: this.measureGraphics, pill: this.measurePill, text: this.measureText }, () => this.playersView);
    
    // Setup viewport scale listener
    this.setupViewportScaleListener();
    
    // Bind handlers
    this.pointerDownHandler = this.handlePointerDown.bind(this);
    this.pointerMoveHandler = this.handlePointerMove.bind(this);
    this.pointerUpHandler = this.handlePointerUp.bind(this);
    
    // Subscribe to tool changes
    this._unsubscribeFromToolChanges = this.store.subscribe((state) => {
      const tool = state.activeTool;
      if (tool === 'measure' || tool === 'measure-circle' || tool === 'measure-cone') {
        this.enableMeasureTool();
        // Update shape based on tool
        if (tool === 'measure') {
          this.measureShape = 'line';
        } else if (tool === 'measure-circle') {
          this.measureShape = 'circle';
        } else if (tool === 'measure-cone') {
          this.measureShape = 'cone';
        }
      } else {
        this.disableMeasureTool();
      }
    });

    // Initialize once on construction
    const initialTool = this.store.getState().activeTool;
    if (initialTool === 'measure' || initialTool === 'measure-circle' || initialTool === 'measure-cone') {
      this.enableMeasureTool();
    }
    
    // Listen for measure shape changes
    this._measureShapeChangedHandler = (shape: MeasureShape) => {
      this.measureShape = shape;
      // Clear any existing measurement when shape changes
      this.clearMeasurement();
    };
    this.eventBus.on('measure-shape-changed', this._measureShapeChangedHandler);
    
    // Listen for persistence changes
    this._measurePersistenceChangedHandler = (persist: boolean) => {
      this.persistMeasurements = persist;
      // If turning off persistence, clear all persistent measurements
      if (!persist) {
        this.clearAllPersistentMeasurements();
      }
    };
    this.eventBus.on('measure-persistence-changed', this._measurePersistenceChangedHandler);
  }
  
  private setupViewportScaleListener(): void {
    // Update text scale whenever viewport scale changes
    this._viewportScaleHandler = () => {
      this.updateTextScale();
    };
    
    // Listen to viewport scale changes
    this.viewport.on('zoomed', this._viewportScaleHandler);
    this.viewport.on('moved', this._viewportScaleHandler);
  }
  
  private updateTextScale(): void {
    if (!this.parts.labelDrawn) return;
    
    this.measureText.style.fontSize = measureLabelFontSize(this.viewport.scale.x);
    
    // Redraw pill if text is visible
    if (this.current.live) {
      this.updatePillAndText();
    }
  }
  
  private enableMeasureTool(): void {
    this.viewport.on('pointerdown', this.pointerDownHandler);
    this.viewport.on('pointermove', this.pointerMoveHandler);
    this.viewport.on('pointerup', this.pointerUpHandler);
    this.viewport.on('pointerupoutside', this.pointerUpHandler);
  }
  
  private disableMeasureTool(): void {
    this.viewport.off('pointerdown', this.pointerDownHandler);
    this.viewport.off('pointermove', this.pointerMoveHandler);
    this.viewport.off('pointerup', this.pointerUpHandler);
    this.viewport.off('pointerupoutside', this.pointerUpHandler);
    this.clearMeasurement();
  }
  
  private handlePointerDown(e: FederatedPointerEvent): void {
    const tool = this.store.getState().activeTool;
    if (tool !== 'measure' && tool !== 'measure-circle' && tool !== 'measure-cone') return;
    
    // Check which button was pressed
    if (e.button === 2) {
      // Right click - allow panning
      this.rightClickDownPos = { x: e.global.x, y: e.global.y };
      // Don't stop propagation for right click - let viewport handle panning
      return;
    }
    
    // Left click - measure tool, unless a pin, door badge or light marker took the press
    if (e.button === 0 && !isHandled(e)) {
      e.stopPropagation();
      
      const point = this.measurePoint(e);
      this.parts.start([this.viewport.toWorld(e.global), point]);
      this.isDrawing = true;
      
      this.updateMeasurement(point, point);
    }
  }
  
  private handlePointerMove(e: FederatedPointerEvent): void {
    const tool = this.store.getState().activeTool;
    if (tool !== 'measure' && tool !== 'measure-circle' && tool !== 'measure-cone') return;
    
    // If right-clicking (panning), don't interfere
    if (this.rightClickDownPos) {
      return;
    }
    
    // Only handle measurement if we're actually drawing
    if (!this.isDrawing) return;
    
    e.stopPropagation();
    
    const live = this.current.live;
    if (live) this.updateMeasurement(live.start, this.measurePoint(e));
  }

  /** Pointer position in world space, snapped to the cell centre while the grid's snap setting is on. */
  private measurePoint(e: FederatedPointerEvent): { x: number; y: number } {
    const world = this.viewport.toWorld(e.global);
    const snapToGrid = this.store.getState().grid?.snapToGrid ?? true;
    return snapToGrid ? this.gridSystem.snapToCellCenter(world.x, world.y) : { x: world.x, y: world.y };
  }
  
  private handlePointerUp(e: FederatedPointerEvent): void {
    const tool = this.store.getState().activeTool;
    if (tool !== 'measure' && tool !== 'measure-circle' && tool !== 'measure-cone') return;
    
    // Clear right-click state
    if (this.rightClickDownPos) {
      this.rightClickDownPos = null;
      return;
    }
    
    // Only handle if we were measuring
    if (!this.isDrawing) return;
    
    e.stopPropagation();
    
    this.isDrawing = false;
    
    // Handle persistence
    if (this.persistMeasurements) {
      // Create persistent copies of the current measurement
      this.createPersistentMeasurement();
      // Clear the active measurement graphics
      this.clearMeasurement();
    } else {
      // Clear after a delay if not persisting
      window.setTimeout(() => {
        if (!this.isDrawing) {
          this.clearMeasurement();
        }
      }, 2000); // Clear after 2 seconds
    }
  }
  
  private updateMeasurement(start: { x: number; y: number }, end: { x: number; y: number }): void {
    const live = { shape: this.measureShape, start, end };
    this.setMeasurements({ ...this.current, live });
    this.measureGraphics.clear();
    drawMeasurement(this.measureGraphics, cssColorToHexNumber(getObsidianAccentColor()), live, this.measurementSettings().coneAngle);
    this.measureText.text = this.measurementLabel(start, end);
    this.parts.drawn();
    this.updatePillAndText();
  }
  
  private updatePillAndText(): void {
    const live = this.current.live;
    if (!live || !this.measureText.text) return;
    drawMeasureLabel(this.measurePill, this.measureText, this.labelAnchor(live.start, live.end), this.viewport.scale.x);
  }

  /** Records the measurements on the map and tells whoever follows them. */
  private setMeasurements(next: Measurements): void {
    const previous = this.current;
    this.current = next;
    for (const listener of [...this.listeners]) listener(next, previous);
  }

  /** Midpoint of the measurement, lifted a constant screen distance above the line. */
  private labelAnchor(start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number } {
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 30 / this.viewport.scale.x };
  }

  private measurementSettings(): MeasurementSettings {
    return this.measurementSettingsProvider?.() ?? resolveMeasurementSettings(undefined, this.store.getState().grid);
  }

  private measurementLabel(start: { x: number; y: number }, end: { x: number; y: number }): string {
    const settings = this.measurementSettings();
    return formatDistance(pathLengthInCells(this.gridSystem.getOptions(), [start, end], settings.diagonalRule), settings);
  }
  
  private clearMeasurement(): void {
    this.measureGraphics.clear();
    this.measurePill.clear();
    this.parts.cleared();
    this.rightClickDownPos = null;
    if (this.current.live) this.setMeasurements({ ...this.current, live: null });
  }
  
  private createPersistentMeasurement(): void {
    if (!this.current.live || !this.measureText.text) return;
    const record: MeasureRecord = { shape: this.measureShape, start: this.current.live.start, end: this.current.live.end };
    
    const persistGraphics = new Graphics();
    const persistPill = new Graphics();
    const persistText = new Text({ 
      text: this.measureText.text, 
      style: this.measureText.style.clone() 
    });
    drawMeasurement(persistGraphics, cssColorToHexNumber(getObsidianAccentColor()), record, this.measurementSettings().coneAngle);

    persistText.anchor.set(0.5);
    drawMeasureLabel(persistPill, persistText, this.labelAnchor(record.start, record.end), this.viewport.scale.x);
    const measurement = { graphics: persistGraphics, pill: persistPill, text: persistText };
    this.parts.keep(measurement);
    
    for (const part of [persistGraphics, persistPill, persistText]) {
      part.zIndex = MAP_LAYER_Z.measure;
      this.viewport.addChild(part);
    }
    
    this.persistentMeasurements.push(measurement);
    this.setMeasurements({ ...this.current, kept: [...this.current.kept, record] });
  }
  
  private clearAllPersistentMeasurements(): void {
    // Remove all persistent measurements from viewport
    for (const measurement of this.persistentMeasurements) {
      if (measurement.graphics.parent) {
        this.viewport.removeChild(measurement.graphics);
      }
      if (measurement.pill.parent) {
        this.viewport.removeChild(measurement.pill);
      }
      if (measurement.text.parent) {
        this.viewport.removeChild(measurement.text);
      }
      
      // Destroy the graphics objects
      measurement.graphics.destroy();
      measurement.pill.destroy();
      measurement.text.destroy();
    }
    
    this.persistentMeasurements = [];
    this.parts.forgetKept();
    if (this.current.kept.length > 0) this.setMeasurements({ ...this.current, kept: [] });
  }

  /** What the players' picture shows of the measurements: one that started on a token they do not see is left out. */
  public getPlayerViewLayers(seen: TokenSeen): LayerVisibility[] {
    return this.parts.playerViewLayers(seen);
  }

  /** The measurements as the GM view shows them, whatever the canvas shows: for a picture of the scene. */
  public getGmViewLayers(): LayerVisibility[] {
    return this.parts.gmViewLayers();
  }

  /** The players' sight changed, or whether the canvas shows it: measurements show or hide by it. */
  public refreshVisibility(): void {
    this.parts.refresh();
  }
  
  public destroy(): void {
    this._unsubscribeFromToolChanges?.();
    
    // Remove viewport scale listener
    if (this._viewportScaleHandler) {
      this.viewport.off('zoomed', this._viewportScaleHandler);
      this.viewport.off('moved', this._viewportScaleHandler);
    }
    
    // Remove event listeners
    if (this._measureShapeChangedHandler) {
      this.eventBus.off('measure-shape-changed', this._measureShapeChangedHandler);
    }
    if (this._measurePersistenceChangedHandler) {
      this.eventBus.off('measure-persistence-changed', this._measurePersistenceChangedHandler);
    }
    
    // Clear all persistent measurements
    this.clearAllPersistentMeasurements();
    
    this.disableMeasureTool();
    this.measureGraphics.destroy();
    this.measurePill.destroy();
    this.measureText.destroy();
    this.listeners.clear();
  }
}
