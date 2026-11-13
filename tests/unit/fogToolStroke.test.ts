import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { FogGesture } from '../../src/app/pixi/fog/FogGesture';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { DEFAULT_FOG_TOOL, type FogToolChoices } from '../../src/app/fog/fogToolChoices';
import { ShapeStroke, type StrokeMode } from '../../src/app/tools/shapeStroke';

interface FogState {
  activeTool: string;
  fogTool: FogToolChoices;
  isMapLoading: boolean;
  grid: { size: number };
  objects: { fog: Record<string, unknown> };
  addFogOperation: ReturnType<typeof vi.fn>;
}

interface FogToolHarness {
  stroke: ShapeStroke;
  /** The fog tool was taken up. */
  start(): void;
  /** The tool's choices changed in its bar. */
  follow(choices: FogToolChoices): void;
  pointerDown(event: FederatedPointerEvent): void;
  pointerMove(event: FederatedPointerEvent): void;
  pointerUp(): void;
  pointerLeave(): void;
  /** What the stroke's keys tell the tool (`FogStrokeKeys`): Alt went down or up, and Escape. */
  setFlipped(held: boolean): void;
  drop(): void;
  keys: { hold: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  ring: { shown: boolean; erasing: boolean | null; radius: number | null };
}

/** What the gesture asks of the fog's picture. */
interface PictureCalls {
  showStroke: ReturnType<typeof vi.fn>;
  showCommitted: ReturnType<typeof vi.fn>;
}

const at = (x: number, y: number, altKey = false): FederatedPointerEvent => ({ button: 0, global: { x, y }, altKey }) as unknown as FederatedPointerEvent;

/** The fog tool's gesture on a 70 px grid, without its canvas: what a stroke commits is what the store is given. */
function fogTool(activeTool: 'fog' | 'eraser', mode: StrokeMode): { tool: FogToolHarness; state: FogState; picture: PictureCalls; viewport: { pause: boolean } } {
  const state: FogState = { activeTool, fogTool: { ...DEFAULT_FOG_TOOL, shape: mode }, isMapLoading: false, grid: { size: 70 }, objects: { fog: {} }, addFogOperation: vi.fn() };
  const picture: PictureCalls = { showStroke: vi.fn(), showCommitted: vi.fn() };
  const viewport = { pause: false, toWorld: (point: { x: number; y: number }) => point, scale: { x: 1 } };
  const tool = Object.assign(Object.create(FogGesture.prototype) as FogGesture, {
    deps: {
      store: { getState: () => state },
      viewport,
      host: picture,
    },
    stroke: Object.assign(new ShapeStroke(), { mode }),
    flipped: false,
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
    outline: { clear: vi.fn(), rect: vi.fn(), poly: vi.fn(), stroke: vi.fn().mockReturnThis(), fill: vi.fn() },
  }) as unknown as FogToolHarness;
  return { tool, state, picture, viewport };
}

describe('the fog tool\'s stroke', () => {
  it('does not redraw fog for a pointer release without a stroke', () => {
    const { tool, picture } = fogTool('fog', 'brush');
    tool.pointerUp();
    expect(picture.showCommitted).not.toHaveBeenCalled();
  });

  it('commits fog with the fog tool and an erase with the eraser, as wide as the brush', () => {
    for (const [activeTool, isErasing] of [['fog', false], ['eraser', true]] as const) {
      const { tool, state } = fogTool(activeTool, 'brush');
      tool.stroke.brushRadius = 35;
      tool.pointerDown(at(100, 100));
      tool.pointerMove(at(130, 110));
      tool.pointerUp();
      expect(state.addFogOperation).toHaveBeenCalledTimes(1);
      expect(state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing, brushRadius: 35, points: [{ x: 100, y: 100 }, { x: 130, y: 110 }] });
    }
  });

  it('snaps only the rectangle to the grid: a lasso and a brush stroke go where the pointer went', () => {
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.pointerDown(at(33, 33));
    lasso.tool.pointerMove(at(141, 37));
    lasso.tool.pointerMove(at(90, 121));
    lasso.tool.pointerUp();
    expect(lasso.state.addFogOperation).toHaveBeenCalledWith({ type: 'lasso', isErasing: false, points: [{ x: 33, y: 33 }, { x: 141, y: 37 }, { x: 90, y: 121 }] });

    const brush = fogTool('fog', 'brush');
    brush.tool.pointerDown(at(33, 33));
    brush.tool.pointerUp();
    expect(brush.state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing: false, brushRadius: 50, points: [{ x: 33, y: 33 }] });

    const rectangle = fogTool('eraser', 'rectangle');
    rectangle.tool.pointerDown(at(33, 33));
    rectangle.tool.pointerMove(at(141, 121));
    rectangle.tool.pointerUp();
    expect(rectangle.state.addFogOperation).toHaveBeenCalledWith({ type: 'rectangle', isErasing: true, x: 0, y: 0, width: 140, height: 140 });
  });

  it('drops the stroke under way when the bar chooses another shape: nothing is committed, and the brush\'s preview goes', () => {
    const { tool, state, picture } = fogTool('fog', 'brush');
    tool.pointerDown(at(100, 100));
    tool.pointerMove(at(160, 100));
    expect(picture.showStroke).toHaveBeenCalledTimes(2);
    expect(picture.showCommitted).not.toHaveBeenCalled();
    expect(tool.keys.hold).toHaveBeenCalledTimes(1);

    tool.follow({ ...state.fogTool, shape: 'lasso' });
    expect(tool.stroke.active).toBe(false);
    expect(tool.stroke.mode).toBe('lasso');
    expect(tool.keys.release).toHaveBeenCalled();
    // The fog as the store holds it, without the stroke that was painted on it.
    expect(picture.showCommitted).toHaveBeenCalledTimes(1);
    // A lasso has no ring.
    expect(tool.ring.shown).toBe(false);
    tool.pointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
  });

  it('takes the brush\'s size from the tool\'s choices, and keeps a stroke under way while only the size changes', () => {
    const { tool, state } = fogTool('fog', 'brush');
    tool.pointerDown(at(100, 100));
    tool.follow({ ...state.fogTool, brushSize: 80 });
    expect(tool.stroke.active).toBe(true);
    expect(tool.ring.radius).toBe(80);
    tool.pointerUp();
    expect(state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing: false, brushRadius: 80, points: [{ x: 100, y: 100 }] });
  });

  it('does the other of hiding and revealing while Alt is held, as the ring and the preview show', () => {
    for (const [activeTool, reveals] of [['fog', false], ['eraser', true]] as const) {
      const { tool, state, picture } = fogTool(activeTool, 'brush');
      tool.pointerDown(at(100, 100, true));
      expect(tool.ring.erasing).toBe(!reveals);
      expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'brush', isErasing: !reveals });
      tool.pointerMove(at(130, 100, true));
      tool.pointerUp();
      expect(state.addFogOperation).toHaveBeenCalledWith(expect.objectContaining({ isErasing: !reveals }));
    }
  });

  it('follows Alt pressed and let go during a stroke: what is committed is what the key says at the release', () => {
    const { tool, state, picture } = fogTool('fog', 'rectangle');
    tool.pointerDown(at(0, 0));
    tool.pointerMove(at(140, 140));
    expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', isErasing: false });
    // The key goes down while the pointer rests: the preview turns around without a move.
    tool.setFlipped(true);
    expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', isErasing: true });
    tool.setFlipped(false);
    expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', isErasing: false });
    tool.pointerUp();
    expect(state.addFogOperation).toHaveBeenCalledWith({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 140, height: 140 });
    expect(tool.keys.release).toHaveBeenCalled();
  });

  it('drops the stroke under way on Escape: nothing is committed and the fog is drawn as the store holds it', () => {
    const { tool, state, picture } = fogTool('fog', 'lasso');
    tool.pointerDown(at(33, 33));
    tool.pointerMove(at(141, 37));
    tool.pointerMove(at(90, 121));
    tool.drop();
    expect(tool.stroke.active).toBe(false);
    expect(tool.keys.release).toHaveBeenCalled();
    expect(picture.showCommitted).toHaveBeenCalledTimes(1);
    // The pointer is still down: what it does until its release belongs to no stroke.
    tool.pointerMove(at(60, 200));
    tool.pointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
    // Without a stroke there is nothing to drop.
    tool.drop();
    expect(picture.showCommitted).toHaveBeenCalledTimes(1);
  });

  it('shows a lasso and a rectangle as the fog they will make, once they are a shape', () => {
    const lasso = fogTool('eraser', 'lasso');
    lasso.tool.pointerDown(at(33, 33));
    lasso.tool.pointerMove(at(141, 37));
    // Two points are no area yet: the fog as it is.
    expect(lasso.picture.showStroke.mock.lastCall?.[0]).toBeUndefined();
    lasso.tool.pointerMove(at(90, 121));
    expect(lasso.picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'lasso', isErasing: true, points: [{ x: 33, y: 33 }, { x: 141, y: 37 }, { x: 90, y: 121 }] });

    const rectangle = fogTool('fog', 'rectangle');
    rectangle.tool.pointerDown(at(33, 33));
    expect(rectangle.picture.showStroke.mock.lastCall?.[0]).toBeUndefined();
    rectangle.tool.pointerMove(at(141, 121));
    expect(rectangle.picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 140, height: 140 });
    // Back on the first corner: no area, and the preview goes.
    rectangle.tool.pointerMove(at(33, 33));
    expect(rectangle.picture.showStroke.mock.lastCall?.[0]).toBeUndefined();
  });

  it('commits nothing for a lasso of two points or a rectangle that never moved, and shows the fog as it is', () => {
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.pointerDown(at(33, 33));
    lasso.tool.pointerMove(at(141, 37));
    lasso.tool.pointerUp();
    expect(lasso.state.addFogOperation).not.toHaveBeenCalled();
    expect(lasso.picture.showCommitted).toHaveBeenCalledTimes(1);
    const rectangle = fogTool('fog', 'rectangle');
    rectangle.tool.pointerDown(at(33, 33));
    rectangle.tool.pointerUp();
    expect(rectangle.state.addFogOperation).not.toHaveBeenCalled();
  });

  it('paints with the primary button only and never pauses the map, so a right-drag pans and the wheel zooms', () => {
    const { tool, state, viewport } = fogTool('fog', 'rectangle');
    tool.start();
    tool.pointerDown({ ...at(140, 140), button: 2 } as FederatedPointerEvent);
    expect(tool.stroke.active).toBe(false);

    tool.pointerDown(at(140, 140));
    expect(tool.stroke.active).toBe(true);
    expect(viewport.pause).toBe(false);
    tool.pointerMove(at(215, 215));
    tool.pointerUp();
    expect(tool.stroke.active).toBe(false);
    // The rectangle's corners snap to the 70 px grid's.
    expect(state.addFogOperation).toHaveBeenCalledExactlyOnceWith({ type: 'rectangle', isErasing: false, x: 140, y: 140, width: 70, height: 70 });
  });

  it('takes no press while another tool is chosen', () => {
    const { tool, state, picture } = fogTool('fog', 'brush');
    state.activeTool = 'select';
    tool.pointerDown(at(100, 100));
    tool.pointerMove(at(130, 100));
    tool.pointerUp();
    expect(tool.stroke.active).toBe(false);
    expect(picture.showStroke).not.toHaveBeenCalled();
    expect(state.addFogOperation).not.toHaveBeenCalled();
  });

  it('hides the brush\'s ring when the pointer leaves the map, and shows it again at the next move', () => {
    const { tool } = fogTool('eraser', 'brush');
    tool.pointerMove(at(100, 100));
    expect(tool.ring.shown).toBe(true);
    tool.pointerLeave();
    expect(tool.ring.shown).toBe(false);
    tool.pointerMove(at(120, 100));
    expect(tool.ring).toMatchObject({ shown: true, erasing: true });

    // A lasso has no ring to bring back.
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.pointerLeave();
    lasso.tool.pointerMove(at(120, 100));
    expect(lasso.tool.ring.shown).toBe(false);
  });
});

interface SceneState {
  mapPath: string;
  activeTool: string;
  fogTool: FogToolChoices;
  isMapLoading: boolean;
  isGMView: boolean;
  objects: { fog: Record<string, unknown> };
}

interface FogRendererHarness {
  state: SceneState;
  gesture: { active: boolean; stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };
  /** How often the fog was drawn as the scene holds it. */
  drawn: ReturnType<typeof vi.fn>;
  /** A store write reaches the renderer. */
  notify(): void;
}

/** The fog renderer following its store, without its canvas: what it draws is what its picture is asked for. */
function fogRenderer(): FogRendererHarness {
  const state: SceneState = { mapPath: 'maps/a.atlasmap', activeTool: 'select', fogTool: DEFAULT_FOG_TOOL, isMapLoading: false, isGMView: true, objects: { fog: {} } };
  const listeners: ((state: SceneState) => void)[] = [];
  const gesture = { active: false, cancel: vi.fn(), follow: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const drawn = vi.fn(() => true);
  const renderer = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
    // The store hands its listeners a new state object after every write
    store: { getState: () => ({ ...state }), subscribe: (listener: (state: SceneState) => void) => (listeners.push(listener), () => undefined) },
    gesture,
    picture: { fit: vi.fn(), drawCommitted: drawn, clear: vi.fn(), followView: vi.fn(), sprite: { visible: false } },
    container: { visible: true },
  }) as unknown as { followStore(): void };
  renderer.followStore();
  return { state, gesture, drawn, notify: () => listeners.forEach((listener) => listener({ ...state })) };
}

describe('the fog renderer', () => {
  it('does not draw the scene\'s fog over a stroke under way, and does once the stroke is over', () => {
    const { state, gesture, drawn, notify } = fogRenderer();
    gesture.active = true;
    // Fog changes under the stroke, as an undo would change it.
    state.objects = { fog: { a: {} } };
    notify();
    expect(drawn).not.toHaveBeenCalled();

    gesture.active = false;
    state.objects = { fog: { a: {}, b: {} } };
    notify();
    expect(drawn).toHaveBeenCalledTimes(1);
  });

  it('draws nothing for a store write that changes no fog', () => {
    const { state, drawn, notify } = fogRenderer();
    state.fogTool = { ...state.fogTool, brushSize: 80 };
    notify();
    expect(drawn).not.toHaveBeenCalled();
  });

  it('starts the gesture with the fog tool and stops it with another', () => {
    const { state, gesture, notify } = fogRenderer();
    state.activeTool = 'fog';
    notify();
    expect(gesture.start).toHaveBeenCalledTimes(1);
    // Hiding to revealing: the tool is still the fog's
    state.activeTool = 'eraser';
    notify();
    expect(gesture.start).toHaveBeenCalledTimes(2);
    expect(gesture.stop).not.toHaveBeenCalled();
    state.activeTool = 'select';
    notify();
    expect(gesture.stop).toHaveBeenCalledTimes(1);
  });
});
