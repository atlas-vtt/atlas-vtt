import { EventEmitter } from 'events';
import type { WallType } from '../types/wallTypes';
import { simplifyStroke } from '../pixi/lighting/wallEdits';

export type WallToolMode = 'point-to-point' | 'freeform';
export type WallToolSubMode = 'draw' | 'place-light' | 'light-zone' | 'level-surface' | 'explored-memory';

export interface WallToolSettings {
  mode: WallToolMode;
  subMode: WallToolSubMode;
  wallType: WallType;
  /** Id of the light preset the place-light mode puts down; null is the collection's default light (`chosenLightPreset`). */
  lightPreset: string | null;
}

/**
 * Handles wall-specific tool state: drawing mode, wall type selection,
 * and light placement mode. Emits events on the shared EventBus.
 */
export class WallTool {
  private settings: WallToolSettings;
  private eventBus: EventEmitter;

  // Point-to-point drawing state
  private chain: Array<{ x: number; y: number }> = [];
  private chainId: string | null = null;
  private isDrawing: boolean = false;

  // Freeform drawing state
  private freeformPoints: Array<{ x: number; y: number }> = [];
  private isFreeformDrawing: boolean = false;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.settings = {
      mode: 'point-to-point',
      subMode: 'draw',
      wallType: 'solid',
      lightPreset: null,
    };
  }

  setMode(mode: WallToolMode): void {
    if (this.settings.mode === mode) return;
    this.cancelDrawing();
    this.settings.mode = mode;
    this.eventBus.emit('wall-mode-changed', mode);
  }

  setSubMode(subMode: WallToolSubMode): void {
    if (this.settings.subMode === subMode) return;
    this.cancelDrawing();
    this.settings.subMode = subMode;
    this.eventBus.emit('wall-submode-changed', subMode);
  }

  setWallType(type: WallType): void {
    this.settings.wallType = type;
    this.eventBus.emit('wall-type-changed', type);
  }

  setLightPreset(preset: string): void {
    this.settings.lightPreset = preset;
  }

  getSettings(): WallToolSettings {
    return { ...this.settings };
  }

  // --- Point-to-Point Drawing ---

  /**
   * Add a vertex to the current chain.
   *
   * - First click: sets the start point (no segment yet).
   * - Subsequent clicks: draws a wall segment from the previous point.
   * - Shift held: keeps the chain going (next click will continue from this point).
   * - No Shift: draws the segment AND finishes the chain, so next click starts fresh.
   */
  addVertex(x: number, y: number, shiftHeld: boolean): void {
    if (!this.isDrawing) {
      // Start a new chain — this vertex is the first point
      this.chainId = `chain_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      this.chain = [{ x, y }];
      this.isDrawing = true;
      this.eventBus.emit('wall-chain-start', { x, y });
      return;
    }

    // We have a previous point — draw a segment
    const prev = this.chain[this.chain.length - 1]!;
    this.chain.push({ x, y });

    this.eventBus.emit('wall-segment-created', {
      p1: prev,
      p2: { x, y },
      type: this.settings.wallType,
      chainId: this.chainId,
    });

    // Without Shift: finish the chain so next click starts fresh
    if (!shiftHeld) {
      this.finishChain();
    }
  }

  /**
   * Continue drawing from an existing wall endpoint.
   * Starts a chain whose first vertex is the given position: the chain `chainId` when given, else a new one.
   */
  continueFromEndpoint(x: number, y: number, chainId?: string): void {
    this.finishChain();
    this.chainId = chainId ?? `chain_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.chain = [{ x, y }];
    this.isDrawing = true;
    this.eventBus.emit('wall-chain-start', { x, y });
  }

  /** Finish the current chain (Escape or implicit on click without Shift). */
  finishChain(): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.chain = [];
    this.chainId = null;
    this.eventBus.emit('wall-chain-finish');
  }

  // --- Freeform Drawing ---

  /** Start freeform drawing. */
  startFreeform(x: number, y: number): void {
    this.chainId = `chain_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.freeformPoints = [{ x, y }];
    this.isFreeformDrawing = true;
    this.eventBus.emit('wall-freeform-start', { x, y });
  }

  /** Add point during freeform drag. */
  addFreeformPoint(x: number, y: number): void {
    if (!this.isFreeformDrawing) return;
    this.freeformPoints.push({ x, y });
    this.eventBus.emit('wall-freeform-point', { x, y });
  }

  /** Finish freeform drawing and simplify path. */
  finishFreeform(): Array<{ x: number; y: number }> {
    if (!this.isFreeformDrawing) return [];
    this.isFreeformDrawing = false;

    const simplified = simplifyStroke(this.freeformPoints, 5);

    // Emit segment creation for each pair of simplified points
    for (let i = 0; i < simplified.length - 1; i++) {
      this.eventBus.emit('wall-segment-created', {
        p1: simplified[i],
        p2: simplified[i + 1],
        type: this.settings.wallType,
        chainId: this.chainId,
      });
    }

    const result = [...simplified];
    this.freeformPoints = [];
    this.chainId = null;
    this.eventBus.emit('wall-freeform-finish', simplified);
    return result;
  }

  isCurrentlyDrawing(): boolean {
    return this.isDrawing || this.isFreeformDrawing;
  }

  getCurrentChain(): Array<{ x: number; y: number }> {
    if (this.isDrawing) return [...this.chain];
    if (this.isFreeformDrawing) return [...this.freeformPoints];
    return [];
  }

  cancelDrawing(): void {
    this.isDrawing = false;
    this.isFreeformDrawing = false;
    this.chain = [];
    this.freeformPoints = [];
    this.chainId = null;
    this.eventBus.emit('wall-drawing-cancelled');
  }
}
