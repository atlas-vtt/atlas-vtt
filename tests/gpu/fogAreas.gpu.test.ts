import { beforeEach, describe, expect, it, vi } from 'vitest';
import { areaOutline, fogAreaList, type FogArea } from '../../src/app/fog/fogAreas';
import { canvasBadgeTheme } from '../../src/app/pixi/utils/canvasBadgeColors';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';
import { fogRect, fogScenes } from '../helpers/fogCoverageScene';

// The menu itself is React's; what it is opened with is the fog's.
const openContextMenuGlobal = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal, closeContextMenuGlobal: vi.fn() }));

const { scene } = fogScenes();
type Scene = Awaited<ReturnType<typeof scene>>;

const SIZE = 128;
const MAP = { x: 0, y: 0, width: SIZE, height: SIZE };
/** The hall, 16 to 80 both ways, hidden with a shape and so remembered as one piece. */
const IN_HALL = { x: 48, y: 48 };
const hall = (changes: Partial<FogRectangleFill> = {}): Record<string, FogOperation> => ({ hall: { ...fogRect('hall'), area: {}, ...changes } });
/** The vault beside it, 80 to 112 across, which shares the hall's right edge. */
const vault = (): Record<string, FogOperation> => ({ vault: { ...fogRect('vault', 2), x: 80, width: 32, area: {} } });

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

/** A right-click released in place at a map point, as the view's dispatch hands it to the fog (`TokenRenderer`, which the integration test covers). */
function rightClick(s: Scene, x: number, y: number): boolean {
  const menu = s.fog.menuPointer();
  if (!menu.menuAt(x, y)) return false;
  menu.openMenu(x, y, x, y);
  return true;
}
const lastCall = (): unknown[] => (openContextMenuGlobal.mock.calls as unknown[][])[openContextMenuGlobal.mock.calls.length - 1]!;
const labels = (): Array<string | null> => (lastCall()[0] as ContextMenuEntry[]).map((entry) => (entry.type === 'item' ? entry.label : null));
/** The menu closes: on a choice, on Escape, on a press beside it. */
const closeMenu = (): void => (lastCall()[2] as { onClose?: () => void }).onClose?.();
const choose = (): void => {
  const [entry] = lastCall()[0] as ContextMenuEntry[];
  if (entry?.type === 'item') entry.onClick();
  closeMenu();
};

beforeEach(() => { openContextMenuGlobal.mockClear(); });

describe('fog that is remembered as one piece', () => {
  it('carries no mark on the map with another tool than the fog tool, hidden or revealed', async () => {
    const s = await scene(hall());
    s.showMapImage(MAP);
    // A picture of the scene is the GM's without the tool's marks: nothing differs.
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers()))).toEqual([]);
    s.store.getState().flipFogArea('hall');
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers()))).toEqual([]);
    s.pointer('pointermove', IN_HALL.x, IN_HALL.y);
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers()))).toEqual([]);
  });

  it('is outlined while the fog tool is chosen, with a solid line while it is hidden and a dashed one while it is revealed', async () => {
    const s = await scene(hall());
    s.showMapImage(MAP);
    expect(accentAlongTop(s.rgba())).toBe(0);

    // A shape without the brush's ring, which is drawn above the outlines.
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('fog');
    expect(accentAlongTop(s.rgba())).toBe(52);
    s.store.getState().flipFogArea('hall');
    const dashed = accentAlongTop(s.rgba());
    expect(dashed).toBeGreaterThan(18);
    expect(dashed).toBeLessThan(42);
    s.store.getState().setActiveTool('eraser');
    expect(accentAlongTop(s.rgba())).toBe(dashed);

    s.store.getState().setActiveTool('move');
    expect(accentAlongTop(s.rgba())).toBe(0);
  });

  it('shows the players no outline, of a hidden piece or of a revealed one', async () => {
    const s = await scene(hall());
    s.showMapImage(MAP);
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('fog');
    // The GM's canvas shows it.
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers())).length).toBeGreaterThan(200);

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
    const revealed = playersSee();
    for (let at = 0; at < revealed.length; at += 4) expect([at, revealed[at], revealed[at + 1], revealed[at + 2]]).toEqual([at, 255, 255, 255]);
  });

  it('is revealed by a right-click on it, exactly it, while the piece beside it stays, and hidden again by a right-click on its ground', async () => {
    const s = await scene({ ...hall(), ...vault() });
    s.showMapImage(MAP);
    const history = getHistoryStore(s.store)!;
    const before = s.frame();

    expect(rightClick(s, IN_HALL.x, IN_HALL.y)).toBe(true);
    expect(labels()).toEqual(['Reveal']);
    // Nothing changes before the entry is chosen.
    expect(s.frame()).toEqual(before);
    choose();
    expect(s.store.getState().objects.fog).toMatchObject({ hall: { isErasing: true }, vault: { isErasing: false } });
    expect(history.getState().pastStates).toHaveLength(1);
    const revealed = s.frame();
    for (let y = 18; y < 78; y++) {
      // The hall is clear to its right edge, and the vault hidden from it on, with a pixel of edge between them.
      for (let x = 18; x < 79; x++) expect([x, y, revealed[y * SIZE + x]]).toEqual([x, y, 255]);
      for (let x = 81; x < 110; x++) expect([x, y, revealed[y * SIZE + x]]).toEqual([x, y, 0]);
    }

    // The same place again: the open ground of the piece offers Hide.
    expect(rightClick(s, IN_HALL.x, IN_HALL.y)).toBe(true);
    expect(labels()).toEqual(['Hide']);
    choose();
    expect(s.frame()).toEqual(before);
    expect(history.getState().pastStates).toHaveLength(2);
    history.getState().undo();
    expect(s.frame()).toEqual(revealed);
    // Beside both, on open ground that was never hidden with a shape, there is nothing to offer.
    expect(rightClick(s, 100, 110)).toBe(false);
  });

  it('is outlined in the accent while the menu is open on it, on the GM\'s canvas alone, and no longer once the menu closes', async () => {
    const s = await scene({ ...hall(), ...vault() });
    s.showMapImage(MAP);
    expect(accentAlongTop(s.rgba())).toBe(0);
    rightClick(s, IN_HALL.x, IN_HALL.y);
    expect(accentAlongTop(s.rgba())).toBe(52);
    // The vault, which the entry leaves alone, is not outlined.
    expect(isAccent(s.rgba(), 96, 16) || isAccent(s.rgba(), 96, 15)).toBe(false);
    expect(accentAlongTop(s.rgba(s.fog.getPlayerViewLayers()))).toBe(0);
    expect(accentAlongTop(s.rgba(s.fog.getGmViewLayers()))).toBe(0);
    closeMenu();
    expect(accentAlongTop(s.rgba())).toBe(0);
  });
});

describe('loose fog under a right-click', () => {
  const blob = (id: string, x: number, y: number, timestamp: number): FogOperation => ({ id, kind: 'fog', timestamp, type: 'brush', isErasing: false, points: [{ x, y }], brushRadius: 14 });

  it('is revealed as the body it is: the body beside it stays, and so does a piece it runs into', async () => {
    // A blob top left with a stroke out of it into the hall, and a blob bottom right that lies apart.
    const s = await scene({
      ...hall({ x: 64, y: 16, width: 48, height: 40 }),
      near: blob('near', 24, 96, 2),
      arm: { id: 'arm', kind: 'fog', timestamp: 3, type: 'rectangle', isErasing: false, x: 20, y: 30, width: 60, height: 8 },
      stem: { id: 'stem', kind: 'fog', timestamp: 4, type: 'rectangle', isErasing: false, x: 20, y: 30, width: 8, height: 60 },
      far: blob('far', 100, 100, 5),
    });
    s.showMapImage(MAP);
    const history = getHistoryStore(s.store)!;
    const before = s.frame();
    expect([s.read(24, 96), s.read(40, 34), s.read(100, 100), s.read(90, 40)]).toEqual([0, 0, 0, 0]);

    expect(rightClick(s, 24, 96)).toBe(true);
    expect(labels()).toEqual(['Reveal']);
    choose();
    expect(history.getState().pastStates).toHaveLength(1);
    // The blob, its stem and the arm up to the hall are gone.
    expect([s.read(24, 96), s.read(24, 60), s.read(40, 34)]).toEqual([255, 255, 255]);
    // The blob that lies apart is as it was, pixel for pixel, and so is the hall within its edge, where the arm ran into it too.
    const after = s.frame();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const apart = x >= 84 && y >= 84;
        const inHall = x >= 66 && x < 110 && y >= 18 && y < 54;
        if (apart || inHall) expect([x, y, after[y * SIZE + x]]).toEqual([x, y, before[y * SIZE + x]]);
      }
    }
    expect([s.read(100, 100), s.read(70, 34), s.read(90, 40)]).toEqual([0, 0, 0]);
    history.getState().undo();
    expect(s.frame()).toEqual(before);
  });
});

describe('a shape drawn to hide', () => {
  it('is fitted to the hidden piece beside it, so each is revealed without opening the other', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    // Corners land where the pointer is, or on a piece.
    s.store.setState((state) => ({ grid: { ...state.grid, snapToGrid: false } }));
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('fog');
    const history = getHistoryStore(s.store)!;
    const steps = history.getState().pastStates.length;
    const areas = (): readonly FogArea[] => fogAreaList(s.store.getState().objects.fog);
    const drag = (from: readonly [number, number], to: readonly [number, number]): void => {
      s.pointer('pointerdown', ...from);
      s.pointer('pointermove', ...to);
      s.pointer('pointerup', ...to);
    };

    // The hall, 16 to 64 both ways: fog while it is drawn, and remembered once it is let go.
    s.pointer('pointerdown', 16, 16);
    s.pointer('pointermove', 64, 64);
    expect(areas()).toEqual([]);
    expect(s.read(40, 40)).toBe(0);
    s.pointer('pointerup', 64, 64);
    expect(areas()).toEqual([expect.objectContaining({ type: 'rectangle', isErasing: false, x: 16, y: 16, width: 48, height: 48 })]);
    const hallId = areas()[0]!.id;
    expect([s.read(40, 40), s.read(100, 100)]).toEqual([0, 255]);
    expect(history.getState().pastStates).toHaveLength(steps + 1);

    // A second shape begun beside the hall and drawn across its right half: it ends at the hall.
    drag([112, 24], [40, 48]);
    expect(areas()).toHaveLength(2);
    const side = areas().find((area) => area.id !== hallId)!;
    expect(Math.min(...areaOutline(side).map((point) => point.x))).toBe(64);
    expect(history.getState().pastStates).toHaveLength(steps + 2);

    // With the hall revealed, all of it is clear: the second piece hides nothing of it.
    s.store.getState().setActiveTool('move');
    expect(rightClick(s, 40, 40)).toBe(true);
    choose();
    const revealed = s.frame();
    for (let y = 18; y < 62; y++) {
      for (let x = 18; x < 62; x++) expect([x, y, revealed[y * SIZE + x]]).toEqual([x, y, 255]);
    }
    expect([s.read(72, 36), s.read(104, 36), s.read(110, 80)]).toEqual([0, 0, 255]);

    // The brush is plain paint: nothing is remembered of it, and a right-click on it reveals its body.
    s.store.getState().setFogTool({ shape: 'brush', brushSize: 10 });
    s.store.getState().setActiveTool('fog');
    drag([20, 100], [60, 100]);
    expect(areas()).toHaveLength(2);
    expect(s.read(40, 100)).toBe(0);
    expect(rightClick(s, 40, 100)).toBe(true);
    choose();
    expect([s.read(40, 100), s.read(72, 36)]).toEqual([255, 0]);
  });
});
