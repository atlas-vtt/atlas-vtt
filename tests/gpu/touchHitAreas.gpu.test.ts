import { describe, expect, it, vi } from 'vitest';
import { Container, Texture, type FederatedPointerEvent } from 'pixi.js';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { ResourceBarHitArea } from '../../src/app/pixi/ResourceBarHitArea';
import { wallEndNear } from '../../src/app/pixi/lighting/wallEnds';
import { fitMapInView, zoomViewByNotch } from '../../src/app/pixi/mapZoomActions';
import { mapFit } from '../../src/app/pixi/fitMapRect';
import type { Character } from '../../src/app/types';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { mouse } from './realMouse';
import { frame, touch, touchMaps, VIEW, wait, type Point, type TouchMap } from './touchHarness';

// A pin's glyph is not what is measured here, and the icons' font is not in the test page.
vi.mock('../../src/app/pixi/utils/pinIconTexture', () => ({ createPinIconTexture: vi.fn(() => new Texture()) }));

// The device's pointer, which decides how large the +/- buttons are drawn: the test's to change.
const device = vi.hoisted(() => ({ coarse: false }));
vi.mock('../../src/app/platform/deviceProfile', async (original) => {
  const actual = await original<typeof import('../../src/app/platform/deviceProfile')>();
  return {
    ...actual,
    deviceProfile: () => {
      const profile = actual.deviceProfile();
      return {
        isMobileApp: profile.isMobileApp, isPhone: profile.isPhone, memoryClass: profile.memoryClass, budgets: profile.budgets,
        pointer: device.coarse ? 'coarse' as const : 'fine' as const,
        pointerScale: () => (device.coarse ? 2 : 1),
        onPointerChange: () => () => undefined,
      };
    },
  };
});

const { map } = touchMaps();

const camera = (m: TouchMap): { x: number; y: number; scale: number } => ({ x: m.viewport.x, y: m.viewport.y, scale: m.viewport.scale.x });
async function rest(m: TouchMap): Promise<void> {
  let before = camera(m);
  for (let i = 0; i < 300; i++) {
    await frame();
    const now = camera(m);
    if (i > 2 && now.x === before.x && now.y === before.y && now.scale === before.scale) return;
    before = now;
  }
}
/** A tap as short as the browser's input takes: under load a finger that lingers becomes a long press. */
async function tap(at: Point): Promise<void> {
  await touch.down(at);
  await touch.up();
  await wait(120);
}

describe('a pin under a finger and under a mouse', () => {
  /** A pin far from the token, on a map so small that its pins are dots 12 px across. */
  const PIN: Point = { x: 520, y: 320 };
  const OFF: Point = { x: PIN.x + 16, y: PIN.y };

  async function withPin(): Promise<{ m: TouchMap; pressed: string[]; pinId: string }> {
    const m = await map();
    const pins = new PinRenderer(m.viewport, new EventEmitter(), m.store);
    pins.setMapSize(() => ({ width: 300, height: 300 }));
    const pressed: string[] = [];
    m.tokens.setPinHitTestProvider((x, y) => pins.hitTestPins(x, y));
    m.tokens.setPinClickHandler((pinId: string, e: FederatedPointerEvent) => {
      pressed.push(pinId);
      pins.handleViewportPinPointerDown(pinId, e);
    });
    const pinId = m.store.getState().addNotePin(PIN.x, PIN.y, 'note.md');
    await frame();
    return { m, pressed, pinId };
  }

  it('is taken by a finger 16 px off its centre, and not by a mouse there', async () => {
    const { pressed, pinId } = await withPin();
    await mouse.hover(OFF.x, OFF.y);
    await mouse.click(OFF.x, OFF.y);
    await wait(60);
    expect(pressed).toEqual([]);

    await tap(OFF);
    expect(pressed).toEqual([pinId]);

    // The mouse is back: its reach is its own again
    await mouse.hover(OFF.x, OFF.y);
    await mouse.click(OFF.x, OFF.y);
    await wait(60);
    expect(pressed).toEqual([pinId]);
    await mouse.click(PIN.x + 8, PIN.y);
    await wait(60);
    expect(pressed).toEqual([pinId, pinId]);
  });

  it('beside a token leaves the token its presses: a finger on the token drags the token', async () => {
    const m = await map();
    const pins = new PinRenderer(m.viewport, new EventEmitter(), m.store);
    pins.setMapSize(() => ({ width: 300, height: 300 }));
    const pressed: string[] = [];
    m.tokens.setPinHitTestProvider((x, y) => pins.hitTestPins(x, y));
    m.tokens.setPinClickHandler((pinId: string) => { pressed.push(pinId); });
    // The token's edge is about 34 px from (200, 200): the finger well inside it, 18 px from a pin that stands outside
    const pinId = m.store.getState().addNotePin(246, 200, 'note.md');
    await frame();
    const on: Point = { x: 228, y: 200 };
    expect(m.tokens.hitTestTokens(on.x, on.y)).toBe('token');
    await touch.down(on);
    await touch.glide([on], [{ x: on.x + 120, y: on.y }]);
    await touch.up();
    await wait(60);
    expect(pressed).toEqual([]);
    expect(m.tokenAt().x).toBeCloseTo(320, 0);

    // The same finger beside the token, as far from the pin, is the pin's
    await tap({ x: 264, y: 200 });
    expect(pressed).toEqual([pinId]);
  });
});

describe('a wall end', () => {
  const wall = { id: 'w', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 }, type: 'wall' } as WallSegment;
  /** 16 px past the wall's end: beyond a mouse's snap of 10, within a finger's of 20. */
  const near = { x: 316, y: 100 };

  it('is caught by a finger within its wider snap, and by a mouse only within its own', async () => {
    const m = await map();
    m.store.setState({ activeTool: 'laser' });
    const zoom = m.viewport.scale.x;
    await mouse.hover(500, 400);
    await frame();
    expect(wallEndNear(near, { w: wall }, zoom)).toBeNull();

    await touch.down({ x: 500, y: 400 });
    await wait(30);
    expect(wallEndNear(near, { w: wall }, zoom)).toEqual({ x: 300, y: 100 });
    expect(wallEndNear({ x: 324, y: 100 }, { w: wall }, zoom)).toBeNull();
    await touch.up();
    await wait(30);

    await mouse.hover(510, 410);
    await frame();
    expect(wallEndNear(near, { w: wall }, zoom)).toBeNull();
    expect(wallEndNear({ x: 308, y: 100 }, { w: wall }, zoom)).toEqual({ x: 300, y: 100 });
  });
});

describe('the zoom buttons\' steps', () => {
  const CENTRE: Point = { x: VIEW.width / 2, y: VIEW.height / 2 };
  const worldAt = (m: TouchMap, at: Point): Point => {
    const world = m.viewport.toWorld(at.x, at.y);
    return { x: world.x, y: world.y };
  };

  it('zoom about the middle of the view, as far as a notch of the wheel there', async () => {
    const m = await map();
    m.viewport.moveCenter(260, 180);
    await frame();
    const under = worldAt(m, CENTRE);
    const before = m.viewport.scale.x;

    zoomViewByNotch(m.viewport, 1);
    await rest(m);
    const stepped = m.viewport.scale.x;
    expect(stepped).toBeGreaterThan(before * 1.1);
    expect(worldAt(m, CENTRE).x).toBeCloseTo(under.x, 1);
    expect(worldAt(m, CENTRE).y).toBeCloseTo(under.y, 1);

    zoomViewByNotch(m.viewport, -1);
    await rest(m);
    expect(m.viewport.scale.x).toBeCloseTo(before, 5);
    expect(worldAt(m, CENTRE).x).toBeCloseTo(under.x, 1);

    // The wheel's own notch at the middle goes as far
    await mouse.hover(CENTRE.x, CENTRE.y);
    await mouse.wheel(CENTRE.x, CENTRE.y, -100);
    await rest(m);
    expect(m.viewport.scale.x).toBeCloseTo(stepped, 4);
  });

  it('stop at the ends of the zoom range', async () => {
    const m = await map();
    for (let i = 0; i < 40; i++) zoomViewByNotch(m.viewport, 1);
    await rest(m);
    expect(m.viewport.scale.x).toBeCloseTo(5, 3);
    for (let i = 0; i < 80; i++) zoomViewByNotch(m.viewport, -1);
    await rest(m);
    expect(m.viewport.scale.x).toBeCloseTo(0.1, 3);
  });

  it('fit shows the whole map, from wherever the camera was', async () => {
    const m = await map();
    const rect = { x: 0, y: 0, width: 2400, height: 900 };
    m.viewport.setZoom(3, true);
    m.viewport.moveCenter(2000, 100);
    await frame();
    fitMapInView(m.viewport, rect);
    await wait(500);
    await rest(m);
    const fit = mapFit(m.viewport, rect);
    expect(m.viewport.scale.x).toBeCloseTo(fit.scale, 4);
    expect(m.viewport.center.x).toBeCloseTo(fit.x, 0);
    expect(m.viewport.center.y).toBeCloseTo(fit.y, 0);
    // All four corners of the map are on screen
    for (const corner of [{ x: 0, y: 0 }, { x: 2400, y: 900 }]) {
      const screen = m.viewport.toScreen(corner.x, corner.y);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(VIEW.width);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(VIEW.height);
    }
  });
});

describe('a selected token\'s +/- buttons', () => {
  interface Box { left: number; top: number; right: number; bottom: number }
  const boxOf = (object: Container): Box => {
    const bounds = object.getBounds();
    return { left: bounds.minX, top: bounds.minY, right: bounds.maxX, bottom: bounds.maxY };
  };
  const meet = (a: Box, b: Box, slack = 0.75): boolean =>
    a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack;
  const shown = (object: Container): boolean => {
    for (let at: Container | null = object; at; at = at.parent) if (!at.visible) return false;
    return true;
  };
  function find(root: Container, is: (object: Container) => boolean, into: Container[] = []): Container[] {
    if (is(root) && shown(root)) into.push(root);
    for (const child of root.children) find(child as Container, is, into);
    return into;
  }
  const buttons = (m: TouchMap): Container[] => find(m.viewport, (object) => 'iconType' in object);
  const bars = (m: TouchMap): Container[] => find(m.viewport, (object) => object instanceof ResourceBarHitArea);

  async function selected(coarse: boolean, zoom: number): Promise<TouchMap> {
    device.coarse = coarse;
    const m = await map();
    m.store.getState().updateToken('token', { resources: { hp: { current: 6, max: 10 }, stress: { current: 2, max: 6 } } } as Partial<Character>);
    m.viewport.setZoom(zoom, true);
    m.viewport.moveCenter(200, 220);
    m.viewport.emit('zoomed', { viewport: m.viewport, type: 'wheel' });
    await frame();
    m.store.getState().setSelection(['token']);
    await expect.poll(() => buttons(m).length, { timeout: 4000 }).toBeGreaterThanOrEqual(2);
    // The UI grows to its selected size
    await wait(450);
    return m;
  }

  for (const zoom of [1, 2.5]) {
    it(`are at least 40 px across under a finger at zoom ${zoom}, and meet neither the bars, the token nor each other`, async () => {
      const m = await selected(true, zoom);
      try {
        const buttonBoxes = buttons(m).map(boxOf);
        const barBoxes = bars(m).map(boxOf);
        expect(buttonBoxes.length).toBe(barBoxes.length * 2);
        expect(barBoxes.length).toBeGreaterThanOrEqual(1);
        for (const box of buttonBoxes) {
          expect(box.right - box.left).toBeGreaterThanOrEqual(40);
          expect(box.bottom - box.top).toBeGreaterThanOrEqual(40);
          for (const bar of barBoxes) expect(meet(box, bar)).toBe(false);
        }
        buttonBoxes.forEach((box, i) => buttonBoxes.forEach((other, j) => { if (i < j) expect(meet(box, other)).toBe(false); }));
        // Never above the first bar's top line: the nameplate lies above it, on the token's edge
        const barsTop = Math.min(...barBoxes.map((bar) => bar.top));
        for (const box of buttonBoxes) expect(box.top).toBeGreaterThanOrEqual(barsTop - 0.75);
      } finally {
        device.coarse = false;
      }
    });
  }

  it('keep a bar\'s height with a mouse, level with their bar', async () => {
    const m = await selected(false, 1);
    const buttonBoxes = buttons(m).map(boxOf);
    const barBoxes = bars(m).map(boxOf);
    expect(buttonBoxes.length).toBe(barBoxes.length * 2);
    for (const box of buttonBoxes) {
      expect(box.right - box.left).toBeLessThan(26);
      const bar = barBoxes.find((candidate) => Math.abs((candidate.top + candidate.bottom) / 2 - (box.top + box.bottom) / 2) < 1);
      expect(bar).toBeDefined();
    }
  });

  it('change the value under a finger\'s tap', async () => {
    const m = await selected(true, 1);
    try {
      const plus = buttons(m).find((button) => (button as Container & { iconType: string }).iconType === 'plus')!;
      const box = boxOf(plus);
      const before = m.store.getState().objects.tokens['token']!.resources!;
      await tap({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });
      const after = m.store.getState().objects.tokens['token']!.resources!;
      const changed = Object.keys(after).filter((key) => after[key]!.current !== before[key]!.current);
      expect(changed).toHaveLength(1);
      expect(after[changed[0]!]!.current).toBe(before[changed[0]!]!.current + 1);
      // The token stayed where it was: the tap was the button's
      expect(m.tokenAt()).toEqual({ x: 200, y: 200 });
    } finally {
      device.coarse = false;
    }
  });

  it('change nothing under the first finger of a pinch that the second joins late', async () => {
    const m = await selected(true, 1);
    try {
      const plus = buttons(m).find((button) => (button as Container & { iconType: string }).iconType === 'plus')!;
      const box = boxOf(plus);
      const on: Point = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
      const second: Point = { x: on.x + 200, y: on.y };
      const before = JSON.stringify(m.store.getState().objects.tokens['token']!.resources);
      await touch.down(on);
      await wait(120);
      await touch.down(on, second);
      await touch.glide([on, second], [{ x: on.x - 40, y: on.y }, { x: second.x + 40, y: second.y }]);
      await touch.up();
      await wait(60);
      expect(JSON.stringify(m.store.getState().objects.tokens['token']!.resources)).toBe(before);
    } finally {
      device.coarse = false;
    }
  });
});
