import { describe, expect, it, vi } from 'vitest';
import type { TFolder } from 'obsidian';
import { lightZoneList } from '../../src/app/lighting/lightZones';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { NotePinTool } from '../../src/app/tools/NotePinTool';
import type { GridState } from '../../src/app/types/gridTypes';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { frame, touch, touchMaps, VIEW, wait, type Point, type TouchMap } from './touchHarness';

// The menus are React's; nothing here opens one.
vi.mock('../../src/app/react/root/ContextMenuContext', async (original) => ({
  ...(await original<typeof import('../../src/app/react/root/ContextMenuContext')>()),
  openContextMenuGlobal: vi.fn(() => true),
  closeContextMenuGlobal: vi.fn(),
}));

const { map } = touchMaps();
/** Between two taps: longer than a double tap waits, so each tap is its own. */
const BETWEEN_TAPS = 450;

/** A finger put down and lifted in place. */
async function tap(at: Point): Promise<void> {
  await touch.down(at);
  await wait(60);
  await touch.up();
  await wait(BETWEEN_TAPS);
  await frame();
}

const worldAt = (m: TouchMap, at: Point): Point => {
  const world = m.viewport.toWorld(at.x, at.y);
  return { x: world.x, y: world.y };
};

describe('the lighting tool\'s Snap switch under a finger', () => {
  /** A wall whose end the second corner of a zone is tapped beside. */
  const WALL_END: Point = { x: 400, y: 120 };
  const BESIDE: Point = { x: WALL_END.x + 5, y: WALL_END.y + 4 };
  const FIRST: Point = { x: 250, y: 330 };
  const THIRD: Point = { x: 560, y: 340 };

  async function zoneCorners(snap: boolean): Promise<{ corners: readonly Point[]; m: TouchMap }> {
    const m = await map();
    const controller = new LightingController({
      viewport: m.viewport, app: m.app, store: m.store, eventBus: new EventEmitter(), obsApp: m.obsidian, viewId: 'touch-homes',
      bounds: () => ({ x: 0, y: 0, width: VIEW.width, height: VIEW.height }), albedo: () => null,
    });
    controller.wire(m.tokens);
    m.taps.lighting = () => controller.tapPlacing();
    const end = worldAt(m, WALL_END);
    m.store.getState().addWall({ type: 'solid', p1: end, p2: { x: end.x + 200, y: end.y } });
    m.store.getState().setActiveTool('wall');
    m.store.getState().setLightingTool({ mode: 'light-zone' });
    m.store.getState().setToolSwitch('lightingSnap', snap);
    await frame();
    try {
      // Three corners, the second beside the wall's end, and the first again to close the zone.
      for (const corner of [FIRST, BESIDE, THIRD, FIRST]) await tap(corner);
      await expect.poll(() => lightZoneList(m.store.getState().objects.lightZones).length).toBe(1);
      return { corners: lightZoneList(m.store.getState().objects.lightZones)[0]!.polygon, m };
    } finally {
      controller.destroy();
    }
  }

  it('lands a tapped corner on the wall end beside it while Snap is on', async () => {
    const { corners, m } = await zoneCorners(true);
    const end = worldAt(m, WALL_END);
    expect(corners[1]!.x).toBeCloseTo(end.x, 3);
    expect(corners[1]!.y).toBeCloseTo(end.y, 3);
  });

  it('lands it where the finger was while Snap is off, with no key held', async () => {
    const { corners, m } = await zoneCorners(false);
    const end = worldAt(m, WALL_END);
    const tapped = worldAt(m, BESIDE);
    expect(Math.hypot(corners[1]!.x - tapped.x, corners[1]!.y - tapped.y)).toBeLessThan(1.5);
    expect(Math.hypot(corners[1]!.x - end.x, corners[1]!.y - end.y)).toBeGreaterThan(4);
  });
});

describe('the note pin tool\'s Link to hex switch under a finger', () => {
  const HEX = 80;
  const TAPPED: Point = { x: 470, y: 290 };

  /** Taps with the pin tool and names the note in the picker that opens. */
  async function pinByTap(linkToHex: boolean): Promise<{ pin: { x: number; y: number; hex?: boolean } | undefined; m: TouchMap }> {
    const m = await map();
    Object.assign(m.obsidian.fileManager, { getNewFileParent: () => m.obsidian.vault.getRoot() as TFolder });
    Object.assign(m.obsidian.vault, { getAllLoadedFiles: () => [] });
    const bus = new EventEmitter();
    const pins = new PinRenderer(m.viewport, bus, m.store);
    const tool = new NotePinTool(bus, m.obsidian, m.store);
    m.store.setState((state) => ({ grid: { ...state.grid, type: 'hex-vertical', size: HEX, offsetX: 0, offsetY: 0, enabled: true } as GridState }));
    m.store.getState().setActiveTool('note-pin');
    m.store.getState().setToolSwitch('pinCell', linkToHex);
    await frame();
    try {
      await tap(TAPPED);
      const input = await expect.poll(() => document.querySelector<HTMLInputElement>('#atlas-note-pin-dropdown .pin-search-input')).not.toBeNull().then(
        () => document.querySelector<HTMLInputElement>('#atlas-note-pin-dropdown .pin-search-input')!,
      );
      input.value = 'Cellar';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await expect.poll(() => Object.keys(m.store.getState().objects.pins).length).toBe(1);
      return { pin: Object.values(m.store.getState().objects.pins)[0], m };
    } finally {
      tool.destroy();
      pins.destroy();
      document.querySelector('#atlas-note-pin-dropdown')?.remove();
    }
  }

  it('links the tapped hex while the switch is on: the pin is the hex\'s, in its centre', async () => {
    const { pin, m } = await pinByTap(true);
    const tapped = worldAt(m, TAPPED);
    expect(pin?.hex).toBe(true);
    // The centre of a hex lies within its circumradius of every point in it, and is not where the finger was.
    expect(Math.hypot(pin!.x - tapped.x, pin!.y - tapped.y)).toBeLessThanOrEqual(HEX / Math.sqrt(3) + 0.5);
    expect(Math.hypot(pin!.x - tapped.x, pin!.y - tapped.y)).toBeGreaterThan(1);
  });

  it('pins the point itself while the switch is off', async () => {
    const { pin, m } = await pinByTap(false);
    const tapped = worldAt(m, TAPPED);
    expect(pin?.hex).toBeUndefined();
    expect(Math.hypot(pin!.x - tapped.x, pin!.y - tapped.y)).toBeLessThan(1.5);
  });
});
