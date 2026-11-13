import { vi } from 'vitest';
import type { FederatedPointerEvent, Graphics } from 'pixi.js';
import { DEFAULT_FOG_TOOL, type FogShape, type FogToolChoices } from '../../src/app/fog/fogToolChoices';
import { FogDrag } from '../../src/app/pixi/fog/FogDrag';
import { FogGesture } from '../../src/app/pixi/fog/FogGesture';
import { FogSnapping, type FogGuideMark, type PlaceKeys } from '../../src/app/pixi/fog/FogSnapping';
import type { ShapeStroke } from '../../src/app/tools/shapeStroke';

/** What the gesture reads of the store. */
export interface FogGestureState {
  activeTool: string;
  fogTool: FogToolChoices;
  isMapLoading: boolean;
  grid: { size: number; type?: 'square' | 'hex-horizontal' | 'hex-vertical'; offsetX?: number; offsetY?: number; snapToGrid?: boolean };
  objects: { fog: Record<string, unknown>; walls: Record<string, unknown> };
  addFogOperation: ReturnType<typeof vi.fn>;
  addFogOperations: ReturnType<typeof vi.fn>;
}

/** The gesture as a test drives it: the pointer, and what its keys tell it (`FogStrokeKeys`). */
export interface FogGestureHarness {
  drag: { stroke: ShapeStroke; active: boolean };
  /** The fog tool was taken up. */
  start(): void;
  /** The tool's choices changed in its bar. */
  follow(choices: FogToolChoices): void;
  pointerDown(event: FederatedPointerEvent): void;
  pointerMove(event: FederatedPointerEvent): void;
  pointerUp(): void;
  pointerLeave(): void;
  /** Alt went down or up. */
  setFlipped(held: boolean): void;
  /** Shift, Ctrl or Cmd went down or up. */
  rekey(keys: PlaceKeys): void;
  /** Escape. */
  drop(): void;
  keys: { hold: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  ring: { shown: boolean; erasing: boolean | null; radius: number | null };
}

/** What the gesture asks of the fog's picture. */
export interface PictureCalls {
  showStroke: ReturnType<typeof vi.fn>;
  showCommitted: ReturnType<typeof vi.fn>;
}

export interface FogGestureScene {
  tool: FogGestureHarness;
  state: FogGestureState;
  picture: PictureCalls;
  viewport: { pause: boolean };
  /** What the snapping guide was last shown; null where it shows nothing. */
  guide: { mark: FogGuideMark | null };
  /** What was drawn as the outline of what is under way, or of the cell under the pointer. */
  outline: { clear: ReturnType<typeof vi.fn>; poly: ReturnType<typeof vi.fn> };
}

interface PressKeys {
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/** A pointer event of the primary button at a place on the map, which the harness's camera shows unscaled. */
export const fogPointerAt = (x: number, y: number, keys: PressKeys = {}): FederatedPointerEvent => ({ button: 0, global: { x, y }, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...keys }) as unknown as FederatedPointerEvent;

/**
 * The fog tool's gesture for drags on a 70 px grid, without its canvas: what a drag commits is
 * what the store is given. Its polygon is a stand-in that is never under way (the polygon's own
 * test builds the gesture whole).
 */
export function fogGestureScene(activeTool: 'fog' | 'eraser', shape: FogShape): FogGestureScene {
  const state: FogGestureState = {
    activeTool, fogTool: { ...DEFAULT_FOG_TOOL, shape }, isMapLoading: false, grid: { size: 70 }, objects: { fog: {}, walls: {} },
    addFogOperation: vi.fn(), addFogOperations: vi.fn(),
  };
  const picture: PictureCalls = { showStroke: vi.fn(), showCommitted: vi.fn() };
  const viewport = { pause: false, toWorld: (point: { x: number; y: number }) => point, scale: { x: 1 } };
  const store = { getState: () => state };
  const guide: FogGestureScene['guide'] = { mark: null };
  const snapping = new FogSnapping({ store: store as never, zoom: () => 1, guide: { show: (mark) => { guide.mark = mark; } } });
  const line = vi.fn().mockReturnThis();
  const outline = { clear: vi.fn(), rect: vi.fn(), poly: vi.fn(), moveTo: line, lineTo: line, circle: line, stroke: line, fill: vi.fn() };
  const tool = Object.assign(Object.create(FogGesture.prototype) as FogGesture, {
    deps: { store, viewport, host: picture },
    shape,
    drag: new FogDrag(outline as unknown as Graphics, snapping, () => 1),
    polygon: { active: false, drop: () => false, rescale: vi.fn() },
    snapping,
    flipped: false,
    pointer: null,
    keys: { hold: vi.fn(), release: vi.fn() },
    ring: {
      shown: true,
      erasing: null as boolean | null,
      radius: null as number | null,
      updatePosition: vi.fn(),
      setBrushRadius(radius: number): void { this.radius = radius; },
      show(erasing: boolean): void { Object.assign(this, { shown: true, erasing }); },
      hide(): void { this.shown = false; },
    },
    outline,
  }) as unknown as FogGestureHarness;
  return { tool, state, picture, viewport, guide, outline };
}
