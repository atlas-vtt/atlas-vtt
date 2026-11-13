import type { FederatedPointerEvent } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { canvasBadgeTheme } from '../../src/app/pixi/utils/canvasBadgeColors';
import { markHandled, resetHandled } from '../../src/app/pixi/utils/handledEvents';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';
import { fogRect, fogScenes } from '../helpers/fogCoverageScene';

const { scene } = fogScenes();
type Scene = Awaited<ReturnType<typeof scene>>;

const SIZE = 128;
const MAP = { x: 0, y: 0, width: SIZE, height: SIZE };
/** The hall: 16 to 80 both ways, its badge in its middle. */
const BADGE = { x: 48, y: 48 };
const hall = (changes: Partial<FogRectangleFill> = {}): Record<string, FogOperation> => ({ hall: { ...fogRect('hall'), area: { name: 'Hall' }, ...changes } });

const index = (x: number, y: number): number => (y * SIZE + x) * 4;

/** The pixels at which two pictures differ in any channel by more than a rounding. */
function changed(a: Uint8ClampedArray, b: Uint8ClampedArray): { x: number; y: number }[] {
  const pixels: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const at = index(x, y);
      if ([0, 1, 2].some((channel) => Math.abs(a[at + channel]! - b[at + channel]!) > 8)) pixels.push({ x, y });
    }
  }
  return pixels;
}

/** The middle of `pixels`, each counted at its own middle. */
const middle = (pixels: readonly { x: number; y: number }[]): { x: number; y: number } => ({
  x: pixels.reduce((sum, pixel) => sum + pixel.x + 0.5, 0) / pixels.length,
  y: pixels.reduce((sum, pixel) => sum + pixel.y + 0.5, 0) / pixels.length,
});
const farthest = (pixels: readonly { x: number; y: number }[], from: { x: number; y: number }): number =>
  Math.max(...pixels.map((pixel) => Math.hypot(pixel.x + 0.5 - from.x, pixel.y + 0.5 - from.y)));

/** Whether the pixel is drawn in the theme's accent, as the areas' outlines are. */
function isAccent(pixels: Uint8ClampedArray, x: number, y: number): boolean {
  const { accent } = canvasBadgeTheme();
  const at = index(x, y);
  return [(accent >> 16) & 0xff, (accent >> 8) & 0xff, accent & 0xff].every((value, channel) => Math.abs(pixels[at + channel]! - value) < 70);
}

/** The pixels along the hall's top edge that are drawn in the accent. */
const accentAlongTop = (pixels: Uint8ClampedArray): number => {
  let count = 0;
  for (let x = 22; x < 74; x++) if (isAccent(pixels, x, 15) || isAccent(pixels, x, 16)) count++;
  return count;
};

/** Gives the badges the presses and moves of the map, as the view's dispatch does (`TokenRenderer`, which the integration test covers). */
function dispatchBadges(s: Scene): void {
  const badges = s.fog.areaPointer();
  s.viewport.on('pointerdown', (event: FederatedPointerEvent) => {
    resetHandled(event);
    const { x, y } = s.viewport.toWorld(event.global);
    const areaId = event.button === 0 ? badges.hitTest(x, y) : null;
    if (!areaId) return;
    markHandled(event);
    badges.press(areaId);
  });
  s.viewport.on('pointermove', (event: FederatedPointerEvent) => {
    const { x, y } = s.viewport.toWorld(event.global);
    badges.hover(badges.hitTest(x, y));
  });
  s.fog.reorderViewportListeners();
}

const click = (s: Scene, x: number, y: number): void => {
  s.pointer('pointerdown', x, y);
  s.pointer('pointerup', x, y);
};

describe('fog areas on the map', () => {
  it('puts a badge in the middle of an area, on the GM\'s canvas alone, as large on screen at any zoom', async () => {
    const s = await scene(hall());
    s.showMapImage(MAP);
    // A picture of the scene is the GM's without the areas' marks: what differs is the badge.
    const badge = changed(s.rgba(), s.rgba(s.fog.getGmViewLayers()));
    expect(badge.length).toBeGreaterThan(380);
    expect(badge.length).toBeLessThan(620);
    expect(middle(badge).x).toBeCloseTo(BADGE.x, 0);
    expect(middle(badge).y).toBeCloseTo(BADGE.y, 0);
    expect(farthest(badge, BADGE)).toBeLessThan(14.5);

    // Twice as near: the badge is where its place is on screen now, and no larger.
    s.viewport.scale.set(2);
    s.viewport.emit('zoomed', { viewport: s.viewport, type: 'wheel' });
    const zoomed = changed(s.rgba(), s.rgba(s.fog.getGmViewLayers()));
    expect(Math.abs(zoomed.length - badge.length)).toBeLessThan(badge.length * 0.15);
    expect(middle(zoomed).x).toBeCloseTo(BADGE.x * 2, 0);
    expect(farthest(zoomed, { x: BADGE.x * 2, y: BADGE.y * 2 })).toBeLessThan(14.5);
  });

  it('shows another glyph on a revealed area than on a hidden one', async () => {
    const s = await scene(hall());
    s.showMapImage(MAP);
    const hidden = s.rgba();
    s.store.getState().flipFogArea('hall');
    const revealed = s.rgba();
    // Within the badge only the glyph differs much: the disc is all but opaque over the fog that went.
    const glyph = changed(hidden, revealed).filter((pixel) => Math.hypot(pixel.x + 0.5 - BADGE.x, pixel.y + 0.5 - BADGE.y) < 8
      && Math.abs(hidden[index(pixel.x, pixel.y)]! - revealed[index(pixel.x, pixel.y)]!) > 60);
    expect(glyph.length).toBeGreaterThan(6);
  });

  it('flips an area on a click on its badge, and the fog follows in the players\' picture', async () => {
    const s = await scene({ all: { id: 'all', kind: 'fog', timestamp: 0, type: 'rectangle', isErasing: false, x: 0, y: 0, width: SIZE, height: SIZE }, ...hall() });
    s.showMapImage(MAP);
    dispatchBadges(s);
    const history = getHistoryStore(s.store)!;
    // In the hall beside the badge, under the badge, and in the map around the hall.
    const places = (): number[] => [s.read(24, 24), s.read(BADGE.x, BADGE.y), s.read(104, 104)];
    expect(places()).toEqual([0, 0, 0]);

    click(s, BADGE.x, BADGE.y);
    expect(s.store.getState().objects.fog.hall).toMatchObject({ isErasing: true });
    expect(places()).toEqual([255, 255, 0]);
    expect(history.getState().pastStates).toHaveLength(1);

    click(s, BADGE.x + 9, BADGE.y);
    expect(places()).toEqual([0, 0, 0]);
    expect(history.getState().pastStates).toHaveLength(2);

    // With the fog tool a click on the badge flips too, and paints nothing.
    s.store.getState().setActiveTool('fog');
    click(s, BADGE.x, BADGE.y);
    expect(places()).toEqual([255, 255, 0]);
    expect(Object.keys(s.store.getState().objects.fog)).toEqual(['all', 'hall']);
    history.getState().undo();
    expect(places()).toEqual([0, 0, 0]);
  });

  it('outlines a hidden area with a solid line and a revealed one with a dashed line, while the fog tool is chosen or the badge is pointed at', async () => {
    const s = await scene(hall());
    s.showMapImage(MAP);
    dispatchBadges(s);
    expect(accentAlongTop(s.rgba())).toBe(0);

    // A shape without the brush's ring, which is drawn above the outlines.
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('fog');
    expect(accentAlongTop(s.rgba())).toBe(52);
    s.store.getState().flipFogArea('hall');
    const dashed = accentAlongTop(s.rgba());
    expect(dashed).toBeGreaterThan(18);
    expect(dashed).toBeLessThan(42);

    s.store.getState().setActiveTool('move');
    expect(accentAlongTop(s.rgba())).toBe(0);
    s.pointer('pointermove', BADGE.x, BADGE.y);
    expect(accentAlongTop(s.rgba())).toBe(dashed);
    s.pointer('pointermove', 110, 110);
    expect(accentAlongTop(s.rgba())).toBe(0);
  });

  it('shows the players no badge, name or outline, of a hidden area or of a revealed one', async () => {
    const s = await scene(hall());
    s.showMapImage(MAP);
    dispatchBadges(s);
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('fog');
    s.pointer('pointermove', BADGE.x, BADGE.y);
    // The GM's canvas shows all of it.
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers())).length).toBeGreaterThan(600);

    const playersSee = (): Uint8ClampedArray => s.rgba(s.fog.getPlayerViewLayers());
    const hidden = playersSee();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // Fog over the hall and the map around it, with a pixel of edge between them.
        const inside = x >= 17 && x < 79 && y >= 17 && y < 79;
        const outside = x < 15 || x >= 81 || y < 15 || y >= 81;
        if (inside) expect([x, y, hidden[index(x, y)]]).toEqual([x, y, 0]);
        if (outside) expect([x, y, hidden[index(x, y)]]).toEqual([x, y, 255]);
      }
    }
    s.store.getState().flipFogArea('hall');
    s.pointer('pointermove', BADGE.x, BADGE.y);
    const revealed = playersSee();
    for (let at = 0; at < revealed.length; at += 4) expect([at, revealed[at], revealed[at + 1], revealed[at + 2]]).toEqual([at, 255, 255, 255]);
  });
});
