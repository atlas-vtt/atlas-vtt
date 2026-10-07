import { FederatedPointerEvent, Graphics, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { EventEmitter } from 'events';
import { getObsidianAccentColor, cssColorToHexNumber } from "./utils/colorUtils";
import type { GridSystem } from "../grid/GridSystem";
import { pathLengthInCells } from '../grid/gridDistance';
import { formatDistance, resolveMeasurementSettings, type MeasurementSettings } from '../grid/measurementFormat';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { isHandled } from './utils/handledEvents';
import { createMeasureLabelText, drawMeasureCircle, drawMeasureLabel, drawMeasurePath, drawMeasurePoint, measureLabelFontSize } from './utils/measureDrawing';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { MeasurePartsVisibility, type MeasurePlayersView } from './measurePartsVisibility';
import type { LayerVisibility } from './playerSafeFrame';
import type { TokenSeen } from '../vision/measureOrigin';

interface PersistentMeasurement {
  graphics: Graphics;
  pill: Graphics;
  text: Text;
}

export class MeasureRenderer {
  private viewport: Viewport;
  private eventBus: EventEmitter;
  private store: StoreApi<ViewAtlasState>;
  private gridSystem: GridSystem;
  
  private measureGraphics: Graphics;
  private measureText: Text;
  private measurePill: Graphics; // Background pill for text
  /** Measurement settings of the current map, from its collection when it has one. */
  public measurementSettingsProvider: (() => MeasurementSettings) | null = null;
  /** How the players see the tokens a measurement starts on; without it, the players' picture shows every measurement. */
  public playersView: MeasurePlayersView | null = null;
  private readonly parts: MeasurePartsVisibility;

  private isDrawing: boolean = false;
  private startPoint: { x: number; y: number } | null = null;
  private endPoint: { x: number; y: number } | null = null;
  private measureShape: 'line' | 'cone' | 'circle' | 'sphere' = 'line';
  private persistMeasurements: boolean = false;
  private persistentMeasurements: PersistentMeasurement[] = [];
  
  private pointerDownHandler: (e: FederatedPointerEvent) => void;
  private pointerMoveHandler: (e: FederatedPointerEvent) => void;
  private pointerUpHandler: (e: FederatedPointerEvent) => void;
  private rightClickDownPos: { x: number; y: number } | null = null;
  
  private _unsubscribeFromToolChanges?: () => void;
  private _viewportScaleHandler?: () => void;
  private _measureShapeChangedHandler?: (shape: 'line' | 'cone' | 'circle' | 'sphere') => void;
  private _measurePersistenceChangedHandler?: (persist: boolean) => void;

  constructor(
    viewport: Viewport,
    eventBus: EventEmitter,
    store: StoreApi<ViewAtlasState>,
    gridSystem: GridSystem
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
    this._unsubscribeFromToolChanges = this.store.subscribe((state: ViewAtlasState) => {
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
    this._measureShapeChangedHandler = (shape: 'line' | 'cone' | 'circle' | 'sphere') => {
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
    if (this.startPoint && this.endPoint) {
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
      this.startPoint = point;
      this.endPoint = point;
      this.isDrawing = true;
      
      this.updateMeasurement();
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
    
    this.endPoint = this.measurePoint(e);
    this.updateMeasurement();
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
  
  private updateMeasurement(): void {
    if (!this.startPoint || !this.endPoint) return;
    
    this.measureGraphics.clear();
    
    // Get accent color from Obsidian theme
    const accent = getObsidianAccentColor();
    const accentHex = cssColorToHexNumber(accent);
    
    // Calculate distance for radius
    const dx = this.endPoint.x - this.startPoint.x;
    const dy = this.endPoint.y - this.startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    switch (this.measureShape) {
      case 'line':
        this.drawLine(accentHex);
        break;
      case 'circle':
      case 'sphere':
        this.drawCircle(accentHex, distance);
        break;
      case 'cone':
        this.drawCone(accentHex, distance, dx, dy);
        break;
    }
    
    drawMeasurePoint(this.measureGraphics, accentHex, this.startPoint);

    this.measureText.text = this.measurementLabel(this.startPoint, this.endPoint);
    this.parts.drawn();
    
    // Update pill and text for current zoom level
    this.updatePillAndText();
  }
  
  private drawLine(color: number): void {
    if (!this.startPoint || !this.endPoint) return;
    this.drawLineOnGraphics(this.measureGraphics, color, this.startPoint, this.endPoint);
  }
  
  private drawCircle(color: number, radius: number): void {
    if (!this.startPoint) return;
    drawMeasureCircle(this.measureGraphics, color, this.startPoint, radius);
  }
  
  private drawCone(color: number, distance: number, dx: number, dy: number): void {
    if (!this.startPoint) return;
    this.drawConeOnGraphics(this.measureGraphics, color, distance, dx, dy, this.startPoint);
  }
  
  private updatePillAndText(): void {
    if (!this.startPoint || !this.endPoint || !this.measureText.text) return;
    drawMeasureLabel(this.measurePill, this.measureText, this.labelAnchor(this.startPoint, this.endPoint), this.viewport.scale.x);
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
    this.startPoint = null;
    this.endPoint = null;
    this.rightClickDownPos = null;
  }
  
  private createPersistentMeasurement(): void {
    if (!this.startPoint || !this.endPoint || !this.measureText.text) return;
    
    // Create new graphics objects for the persistent measurement
    const persistGraphics = new Graphics();
    const persistPill = new Graphics();
    const persistText = new Text({ 
      text: this.measureText.text, 
      style: this.measureText.style.clone() 
    });
    
    // Copy the current measurement graphics
    persistGraphics.clear();
    const accent = getObsidianAccentColor();
    const accentHex = cssColorToHexNumber(accent);
    
    // Redraw the measurement shape
    const dx = this.endPoint.x - this.startPoint.x;
    const dy = this.endPoint.y - this.startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    switch (this.measureShape) {
      case 'line':
        this.drawLineOnGraphics(persistGraphics, accentHex, this.startPoint, this.endPoint);
        break;
      case 'circle':
      case 'sphere':
        drawMeasureCircle(persistGraphics, accentHex, this.startPoint, distance);
        break;
      case 'cone':
        this.drawConeOnGraphics(persistGraphics, accentHex, distance, dx, dy, this.startPoint);
        break;
    }
    
    drawMeasurePoint(persistGraphics, accentHex, this.startPoint);

    persistText.anchor.set(0.5);
    drawMeasureLabel(persistPill, persistText, this.labelAnchor(this.startPoint, this.endPoint), this.viewport.scale.x);
    const measurement = { graphics: persistGraphics, pill: persistPill, text: persistText };
    this.parts.keep(measurement);
    
    for (const part of [persistGraphics, persistPill, persistText]) {
      part.zIndex = MAP_LAYER_Z.measure;
      this.viewport.addChild(part);
    }
    
    // Store the persistent measurement
    this.persistentMeasurements.push(measurement);
  }
  
  private drawLineOnGraphics(graphics: Graphics, color: number, start: { x: number; y: number }, end: { x: number; y: number }): void {
    drawMeasurePath(graphics, color, [start, end]);
    drawMeasurePoint(graphics, color, end);
  }
  
  private drawConeOnGraphics(graphics: Graphics, color: number, distance: number, dx: number, dy: number, start: { x: number; y: number }): void {
    // The collection's game system sets how wide the cone opens
    const halfAngle = this.measurementSettings().coneAngle * Math.PI / 360;
    
    // Calculate the angle of the line
    const baseAngle = Math.atan2(dy, dx);
    
    // Calculate the two edge points of the cone
    const leftAngle = baseAngle - halfAngle;
    const rightAngle = baseAngle + halfAngle;
    
    const leftX = start.x + distance * Math.cos(leftAngle);
    const leftY = start.y + distance * Math.sin(leftAngle);
    const rightX = start.x + distance * Math.cos(rightAngle);
    const rightY = start.y + distance * Math.sin(rightAngle);
    
    // Draw the cone shape
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(leftX, leftY);
    graphics.arc(
      start.x, 
      start.y, 
      distance, 
      leftAngle, 
      rightAngle, 
      false
    );
    graphics.lineTo(start.x, start.y);
    graphics.fill({ color: color, alpha: 0.1 });
    
    // Draw the outline
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(leftX, leftY);
    graphics.stroke({ width: 3, color: color, alpha: 0.8 });
    
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(rightX, rightY);
    graphics.stroke({ width: 3, color: color, alpha: 0.8 });
    
    // Draw the arc
    graphics.arc(
      start.x, 
      start.y, 
      distance, 
      leftAngle, 
      rightAngle, 
      false
    );
    graphics.stroke({ width: 3, color: color, alpha: 0.8 });
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
    
    // Clear the array
    this.persistentMeasurements = [];
    this.parts.forgetKept();
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
  }
}
