// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setup, teardown } from '../mocks/lightInteractionSetup';
import { ringHandleCursor, ringHandlePoint, ringRadiusAt } from '../../src/app/pixi/lighting/lightRingGeometry';
import { grownOutline } from '../../src/app/lighting/polygonClip';
import type { LightEmission } from '../../src/app/types/lightingTypes';

afterEach(teardown);

/** Lava from (600, 100) to (700, 200), bright 5 ft (70 px) and dim 10 ft (140 px) from its shore. */
const AREA = [{ x: 600, y: 100 }, { x: 700, y: 100 }, { x: 700, y: 200 }, { x: 600, y: 200 }];
const LAVA: LightEmission = { bright: 5, dim: 10, color: '#ff7a2a', intensity: 1, animation: 'smoulder' };

function withLava(): ReturnType<typeof setup> & { lava: string } {
  const harness = setup();
  const lava = harness.store.getState().addLight({ x: 650, y: 150, area: AREA, emission: LAVA });
  harness.store.temporal.getState().clear();
  return { ...harness, lava };
}

describe('dragging an area light', () => {
  it('leaves it where its surface is, with every tool that moves lights, and still opens its popover on a click', () => {
    const { store, lava, tool, press, move, up, steps } = withLava();
    for (const [active, moves] of [[true, false], [false, true]] as const) {
      tool.active = active;
      tool.moves = moves;
      press(650, 150);
      move(680, 170);
      up();
      expect(store.getState().objects.lights[lava]).toMatchObject({ x: 650, y: 150, area: AREA });
    }
    expect(steps()).toBe(0);
    press(650, 150);
    up();
    expect(store.getState().lightPopover).toBe(lava);
  });
});

describe('the range rings of an area light', () => {
  const geometry = { center: { x: 650, y: 150 }, radius: { bright: 70, dim: 140 }, area: AREA };

  it('have their handles above and below the area, on its outline grown by each range', () => {
    expect(ringHandlePoint(geometry, 'bright')).toEqual({ x: 600, y: 30 });
    expect(ringHandlePoint(geometry, 'dim')).toEqual({ x: 700, y: 340 });
    expect(ringRadiusAt(geometry, 'dim', { x: 650, y: 368 })).toBe(168);
    expect(ringHandleCursor(geometry, 'dim')).toBe('ns-resize');
    // Every point of the grown outline lies its range from the area.
    for (const ring of grownOutline(AREA, 70)) {
      for (const { x, y } of ring) {
        const dx = Math.max(600 - x, 0, x - 700), dy = Math.max(100 - y, 0, y - 200);
        expect(Math.hypot(dx, dy)).toBeCloseTo(70, 0);
      }
    }
  });

  it('resize the dim range from the shore with its handle, as one undo step', () => {
    const { store, lava, rings, press, move, up, steps } = withLava();
    store.getState().openLightPopover(lava);
    expect(rings.handleAt(700, 340)).toBe('dim');
    expect(press(700, 340)).toBe(true);
    move(700, 368);
    up();
    expect(store.getState().objects.lights[lava]!.emission.dim).toBe(12);
    expect(steps()).toBe(1);
  });
});
