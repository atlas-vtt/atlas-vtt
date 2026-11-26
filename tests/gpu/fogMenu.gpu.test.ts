import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fogAreaList } from '../../src/app/fog/fogAreas';
import { canvasBadgeTheme } from '../../src/app/pixi/utils/canvasBadgeColors';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { fogRect, fogScenes } from '../helpers/fogCoverageScene';

// The menu itself is React's; what it is opened with is the fog's.
const openContextMenuGlobal = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal, closeContextMenuGlobal: vi.fn() }));

const { scene } = fogScenes();
type Scene = Awaited<ReturnType<typeof scene>>;

const SIZE = 128;
const MAP = { x: 0, y: 0, width: SIZE, height: SIZE };
/** The hall, 16 to 80 both ways, and the vault beside it, 80 to 112 across, which shares the hall's right edge: fog that touches. */
const IN_HALL = { x: 48, y: 48 };
const IN_VAULT = { x: 96, y: 48 };
const rooms = (): Record<string, FogOperation> => ({ hall: fogRect('hall'), vault: { ...fogRect('vault', 2), x: 80, width: 32 } });
/** A blob of brushed fog bottom left, apart from the rooms. */
const blob = (): Record<string, FogOperation> => ({ blob: { id: 'blob', kind: 'fog', timestamp: 3, type: 'brush', isErasing: false, points: [{ x: 28, y: 106 }], brushRadius: 12 } });

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

/** The pixels along the top edge of the rooms, from the hall's corner to the vault's, that are drawn in the accent. */
const accentAlongTop = (pixels: Uint8ClampedArray): number => {
  let count = 0;
  for (let x = 22; x < 106; x++) if (isAccent(pixels, x, 15) || isAccent(pixels, x, 16)) count++;
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
/** Chooses the entry named `label`: the menu's first where none is named. */
const choose = (label?: string): void => {
  const entry = (lastCall()[0] as ContextMenuEntry[]).find((candidate) => candidate.type === 'item' && (label === undefined || candidate.label === label));
  expect(entry).toBeDefined();
  if (entry?.type === 'item') entry.onClick();
  closeMenu();
};
/** What the menu offers on fog, whatever painted it, and on the open ground of fog that was revealed. */
const ON_FOG = ['Reveal', 'Delete'];
const ON_REVEALED = ['Hide', 'Delete'];

beforeEach(() => { openContextMenuGlobal.mockClear(); });

describe('fog on the map', () => {
  it.each(['fog', 'eraser', 'move'] as const)('is all that is drawn with the %s tool: no outline, no marker, of fog that was painted or of fog that was revealed', async (tool) => {
    const s = await scene({ ...rooms(), ...blob() });
    s.showMapImage(MAP);
    // A shape without the brush's ring, which follows the pointer.
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool(tool);
    // A picture of the scene is the GM's canvas without the tool's marks: nothing differs.
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers()))).toEqual([]);
    expect(accentAlongTop(s.rgba())).toBe(0);
    // Revealed from the menu, the blob leaves open ground and nothing else: no outline of what is remembered.
    rightClick(s, 28, 106);
    choose('Reveal');
    expect(fogAreaList(s.store.getState().objects.fog)).toHaveLength(1);
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers()))).toEqual([]);
    expect(s.read(28, 106)).toBe(255);
  });

  it('leaves nothing drawn where the eraser passed', async () => {
    const s = await scene({ ...rooms(), ...blob() });
    s.showMapImage(MAP);
    s.store.setState((state) => ({ grid: { ...state.grid, snapToGrid: false } }));
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('eraser');
    s.pointer('pointerdown', 10, 10);
    s.pointer('pointermove', 60, 60);
    // Under way, the GM alone sees what will go.
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers())).length).toBeGreaterThan(100);
    expect(s.read(40, 40)).toBe(0);
    s.pointer('pointerup', 60, 60);
    s.pointer('pointermove', 120, 120);
    expect(changed(s.rgba(), s.rgba(s.fog.getGmViewLayers()))).toEqual([]);
    expect([s.read(40, 40), s.read(70, 70)]).toEqual([255, 0]);
    expect(fogAreaList(s.store.getState().objects.fog)).toEqual([]);
  });
});

describe('the fog\'s menu on a real picture', () => {
  it('Reveal takes the whole object away, fog that touches with it, and Hide on its ground brings the same picture back', async () => {
    const s = await scene({ ...rooms(), ...blob() });
    s.showMapImage(MAP);
    const history = getHistoryStore(s.store)!;
    const before = s.frame();

    expect(rightClick(s, IN_HALL.x, IN_HALL.y)).toBe(true);
    expect(labels()).toEqual(ON_FOG);
    // Nothing changes before an entry is chosen.
    expect(s.frame()).toEqual(before);
    choose('Reveal');
    expect(history.getState().pastStates).toHaveLength(1);
    const revealed = s.frame();
    // The hall and the vault are open to their edges, and the blob is as it was, pixel for pixel.
    for (let y = 12; y < 84; y++) {
      for (let x = 12; x < 116; x++) expect([x, y, revealed[y * SIZE + x]]).toEqual([x, y, 255]);
    }
    for (let y = 90; y < SIZE; y++) {
      for (let x = 0; x < 48; x++) expect([x, y, revealed[y * SIZE + x]]).toEqual([x, y, before[y * SIZE + x]]);
    }
    expect(s.read(28, 106)).toBe(0);

    // The ground of either room offers Hide, which brings back exactly the fog that was there.
    expect(rightClick(s, IN_VAULT.x, IN_VAULT.y)).toBe(true);
    expect(labels()).toEqual(ON_REVEALED);
    choose('Hide');
    expect(s.frame()).toEqual(before);
    expect(history.getState().pastStates).toHaveLength(2);
    expect(fogAreaList(s.store.getState().objects.fog)).toEqual([]);
    history.getState().undo();
    expect(s.frame()).toEqual(revealed);
    history.getState().undo();
    expect(s.frame()).toEqual(before);
  });

  it('Delete removes the whole object for good, and what was revealed for good too: the ground has no menu', async () => {
    const s = await scene({ ...rooms(), ...blob() });
    s.showMapImage(MAP);
    const history = getHistoryStore(s.store)!;
    const before = s.frame();
    expect(rightClick(s, IN_VAULT.x, IN_VAULT.y)).toBe(true);
    choose('Delete');
    expect([s.read(IN_HALL.x, IN_HALL.y), s.read(IN_VAULT.x, IN_VAULT.y), s.read(28, 106)]).toEqual([255, 255, 0]);
    expect(rightClick(s, IN_HALL.x, IN_HALL.y)).toBe(false);
    expect(rightClick(s, IN_VAULT.x, IN_VAULT.y)).toBe(false);
    history.getState().undo();
    expect(s.frame()).toEqual(before);

    // Revealed, then deleted from its ground: the picture stays the revealed one, and nothing brings the fog back.
    rightClick(s, 28, 106);
    choose('Reveal');
    const revealed = s.frame();
    expect(rightClick(s, 28, 106)).toBe(true);
    expect(labels()).toEqual(ON_REVEALED);
    choose('Delete');
    expect(s.frame()).toEqual(revealed);
    expect(rightClick(s, 28, 106)).toBe(false);
    // Beside all of it, on open ground, there was never a menu.
    expect(rightClick(s, 100, 110)).toBe(false);
  });

  it('is two objects where fog does not touch, and one again once fog is painted between them', async () => {
    const s = await scene({ ...rooms(), ...blob() });
    s.showMapImage(MAP);
    rightClick(s, 28, 106);
    choose('Delete');
    expect([s.read(28, 106), s.read(IN_HALL.x, IN_HALL.y)]).toEqual([255, 0]);
    getHistoryStore(s.store)!.getState().undo();
    s.store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 20, y: 70, width: 16, height: 30 });
    rightClick(s, 28, 106);
    choose('Delete');
    expect([s.read(28, 106), s.read(IN_HALL.x, IN_HALL.y), s.read(IN_VAULT.x, IN_VAULT.y)]).toEqual([255, 255, 255]);
  });

  it('outlines what it acts on in the accent while it is open, on the GM\'s canvas alone, and no longer once it closes', async () => {
    const s = await scene({ ...rooms(), ...blob() });
    s.showMapImage(MAP);
    expect(accentAlongTop(s.rgba())).toBe(0);
    rightClick(s, IN_HALL.x, IN_HALL.y);
    // Round both rooms, which are one object: along the whole of their top edge.
    expect(accentAlongTop(s.rgba())).toBe(84);
    // Not along the edge they share.
    expect(isAccent(s.rgba(), 80, 48) || isAccent(s.rgba(), 79, 48)).toBe(false);
    expect(accentAlongTop(s.rgba(s.fog.getPlayerViewLayers()))).toBe(0);
    expect(accentAlongTop(s.rgba(s.fog.getGmViewLayers()))).toBe(0);
    closeMenu();
    expect(accentAlongTop(s.rgba())).toBe(0);
  });
});

describe('a shape drawn with the fog tool', () => {
  it('is plain fog: drawn across fog that is there it is one object with it', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    // Corners land where the pointer is.
    s.store.setState((state) => ({ grid: { ...state.grid, snapToGrid: false } }));
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('fog');
    const drag = (from: readonly [number, number], to: readonly [number, number]): void => {
      s.pointer('pointerdown', ...from);
      s.pointer('pointermove', ...to);
      s.pointer('pointerup', ...to);
    };
    const fog = (): FogOperation[] => Object.values(s.store.getState().objects.fog);

    // The hall, 16 to 64 both ways: fog while it is drawn, and when it is let go.
    s.pointer('pointerdown', 16, 16);
    s.pointer('pointermove', 64, 64);
    expect(fog()).toEqual([]);
    expect(s.read(40, 40)).toBe(0);
    s.pointer('pointerup', 64, 64);
    expect(fog()).toEqual([expect.objectContaining({ type: 'rectangle', isErasing: false, x: 16, y: 16, width: 48, height: 48 })]);
    // A second shape across its right half, as it was drawn.
    drag([112, 24], [40, 48]);
    expect(fog()[1]).toMatchObject({ type: 'rectangle', isErasing: false, x: 40, y: 24, width: 72, height: 24 });
    expect(fog().some((operation) => 'area' in operation)).toBe(false);
    // A brush stroke apart from both.
    s.store.getState().setFogTool({ shape: 'brush', brushSize: 10 });
    drag([20, 100], [60, 100]);
    expect([s.read(40, 40), s.read(100, 36), s.read(40, 100), s.read(110, 80)]).toEqual([0, 0, 0, 255]);

    // The two rectangles are one object, the stroke another.
    s.store.getState().setActiveTool('move');
    expect(rightClick(s, 100, 36)).toBe(true);
    choose('Delete');
    expect([s.read(40, 40), s.read(100, 36), s.read(40, 100)]).toEqual([255, 255, 0]);
  });
});
