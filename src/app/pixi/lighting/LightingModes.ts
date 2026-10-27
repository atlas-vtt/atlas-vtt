import type { Container } from 'pixi.js';
import type { Point } from '../../types/visionTypes';
import type { LayerVisibility } from '../playerSafeFrame';
import { ExploredBrush, type ExploredBrushDeps } from './ExploredBrush';
import { LightZoneEditor, type LightZoneEditorDeps } from './LightZoneEditor';
import { LevelSurfaceEditor } from '../levelSurfaces/LevelSurfaceEditor';

/** What a press needs of the pointer event (`LightZoneEditor`). */
type Keys = { altKey: boolean };

/**
 * The lighting tool's modes that take every press of the tool, across walls and lights alike:
 * light zones (`LightZoneEditor`), openings to the level below (`LevelSurfaceEditor`) and explored
 * memory (`ExploredBrush`). One is in use at most; this routes the pointer and the keys to it and
 * names their layers, all GM overlays.
 */
export class LightingModes {
  readonly zones: LightZoneEditor;
  readonly surfaces: LevelSurfaceEditor;
  readonly memory: ExploredBrush;

  constructor(deps: LightZoneEditorDeps & Pick<ExploredBrushDeps, 'bounds' | 'edit' | 'announce'> & { onSurfacesFull: () => void }) {
    this.zones = new LightZoneEditor(deps);
    this.surfaces = new LevelSurfaceEditor({ ...deps, onFull: deps.onSurfacesFull });
    this.memory = new ExploredBrush(deps);
  }

  /** The tool is in one of these modes: walls and lights take no press. */
  get active(): boolean {
    return this.zones.active || this.surfaces.active || this.memory.chosen;
  }

  /** The modes' layers (`GmOverlays`). */
  get views(): { lightZones: Container; levelSurfaces: Container; exploredMemory: Container } {
    return { lightZones: this.zones.view, levelSurfaces: this.surfaces.view, exploredMemory: this.memory.view };
  }

  /** Their layers as the GM sees them: each only with the lighting tool in its mode. */
  layers(tool: boolean): LayerVisibility[] {
    return [
      { layer: this.zones.view, visible: tool && this.zones.active },
      { layer: this.surfaces.view, visible: tool && this.surfaces.active },
      { layer: this.memory.view, visible: tool && this.memory.active },
    ];
  }

  /** The polygon editor of the mode in use: openings, else light zones. */
  private get areas(): LightZoneEditor | LevelSurfaceEditor {
    return this.surfaces.active ? this.surfaces : this.zones;
  }

  pointerDown(point: Point, keys: Keys): boolean {
    return this.memory.chosen ? this.memory.pointerDown(point) : this.areas.pointerDown(point, keys);
  }

  pointerMove(point: Point, keys: Keys): void {
    if (this.memory.chosen) this.memory.pointerMove(point);
    else this.areas.pointerMove(point, keys);
  }

  pointerUp(): void {
    this.zones.pointerUp();
    this.surfaces.pointerUp();
    this.memory.pointerUp();
  }

  /** The pointer left the map's canvas. */
  pointerLeft(): void {
    this.memory.pointerLeft();
  }

  doubleClick(): void {
    if (this.zones.active || this.surfaces.active) this.areas.doubleClick();
  }

  cursorAt(point: Point): string {
    return this.memory.chosen ? 'crosshair' : this.areas.cursorAt(point);
  }

  handleEscape(): boolean {
    return this.memory.handleEscape() || this.zones.handleEscape() || this.surfaces.handleEscape();
  }

  handleEnter(): boolean {
    return this.zones.handleEnter() || this.surfaces.handleEnter();
  }

  handleDelete(): boolean {
    return this.zones.handleDelete() || this.surfaces.handleDelete();
  }

  /** Ends whatever is under way in any mode. */
  stop(): void {
    this.zones.stop();
    this.surfaces.stop();
    this.memory.stop();
  }

  afterVisibilityChange(): void {
    this.zones.afterVisibilityChange();
    this.surfaces.afterVisibilityChange();
    this.memory.afterVisibilityChange();
  }

  destroy(): void {
    this.zones.destroy();
    this.surfaces.destroy();
    this.memory.destroy();
  }
}
