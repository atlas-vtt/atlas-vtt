// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { genericLight } from '../mocks/lights';
import { setup, teardown, type Setup } from '../mocks/lightInteractionSetup';
import { ringHandleAt, ringHandleCursor, ringHandlePoint, ringHandlePoints, rotationHandlePoint } from '../../src/app/pixi/lighting/lightRingGeometry';
import { getHistoryStore } from '../../src/app/stores/history';

afterEach(teardown);

describe('the rings of a light that shines one way', () => {
  /** The torch as a beam 90° wide facing right: bright 280 px, dim 560 px. */
  function beam(rotation = 90): Setup {
    const made = setup();
    made.store.getState().updateLight(made.torch, { rotation, emission: { ...genericLight('torch'), kind: 'torch', angle: 90 } });
    getHistoryStore(made.store)!.getState().clear();
    made.store.getState().openLightPopover(made.torch);
    return made;
  }
  const RIGHT = { center: { x: 400, y: 300 }, radius: { bright: 280, dim: 560 }, cone: { facing: 0, angle: Math.PI / 2 } };

  it('have the range handles on the beam\'s two edges and a handle to turn it beyond the dim arc', () => {
    const edge = Math.SQRT1_2;
    expect(ringHandlePoint(RIGHT, 'bright').x).toBeCloseTo(400 + 280 * edge);
    expect(ringHandlePoint(RIGHT, 'bright').y).toBeCloseTo(300 - 280 * edge);
    expect(ringHandlePoint(RIGHT, 'dim').x).toBeCloseTo(400 + 560 * edge);
    expect(ringHandlePoint(RIGHT, 'dim').y).toBeCloseTo(300 + 560 * edge);
    // 22 px on screen beyond the dim arc, on the beam's axis.
    expect(rotationHandlePoint(RIGHT, 1)).toEqual({ x: 982, y: 300 });
    expect(rotationHandlePoint(RIGHT, 2)).toEqual({ x: 971, y: 300 });
    expect(ringHandleAt(RIGHT, { x: 978, y: 304 }, 1)).toBe('rotation');
    expect(ringHandleAt(RIGHT, { x: 400 + 560 * edge, y: 300 + 560 * edge }, 1)).toBe('dim');
    // No handle is left above and below the light, where an all-around light has them.
    expect(ringHandleAt(RIGHT, { x: 400, y: 20 }, 1)).toBeNull();
    expect(ringHandlePoints(RIGHT, 1)).toHaveLength(3);
  });

  it('have no handle to turn a light that shines all around, or one that reaches nowhere', () => {
    const { cone: _cone, ...around } = RIGHT;
    expect(rotationHandlePoint(around, 1)).toBeNull();
    expect(ringHandlePoints(around, 1)).toEqual([{ x: 400, y: 20 }, { x: 400, y: 860 }]);
    expect(rotationHandlePoint({ ...RIGHT, radius: { bright: 0, dim: 0 } }, 1)).toBeNull();
  });

  it('show the cursor of the way each handle moves', () => {
    const { cone: _cone, ...around } = RIGHT;
    expect(ringHandleCursor(around, 'bright')).toBe('ns-resize');
    expect(ringHandleCursor(around, 'dim')).toBe('ns-resize');
    expect(ringHandleCursor(RIGHT, 'bright')).toBe('nesw-resize');
    expect(ringHandleCursor(RIGHT, 'dim')).toBe('nwse-resize');
    expect(ringHandleCursor({ ...RIGHT, cone: { facing: 0, angle: 0.1 } }, 'dim')).toBe('ew-resize');
    expect(ringHandleCursor(RIGHT, 'rotation')).toBe('grab');
  });

  it('carry the beam of the open light, and none for a light that shines all around or a darkness', () => {
    const { store, rings, torch, lights } = beam();
    expect(rings.geometry()?.cone?.facing).toBeCloseTo(0);
    expect(rings.geometry()?.cone?.angle).toBeCloseTo(Math.PI / 2);
    expect(rings.handleAt(982, 300)).toBe('rotation');
    expect(lights.cursorAt({ x: 982, y: 300 })).toBe('grab');
    store.getState().updateLight(torch, { emission: { ...genericLight('torch'), angle: 90, darkness: true } });
    expect(rings.geometry()?.cone).toBeUndefined();
    store.getState().updateLight(torch, { emission: genericLight('torch') });
    expect(rings.geometry()?.cone).toBeUndefined();
    expect(rings.handleAt(982, 300)).toBeNull();
  });

  it('turn the light when the handle is dragged, in steps of five degrees, as one undo step', () => {
    const { store, torch, press, move, up, steps, undo } = beam();
    expect(press(982, 300)).toBe(true);
    move(700, 595);
    // 44.5° below the axis: the light faces 134.5°, which snaps to 135.
    expect(store.getState().objects.lights[torch]!.rotation).toBe(135);
    move(400, 900);
    expect(store.getState().objects.lights[torch]!.rotation).toBe(180);
    up();
    expect(steps()).toBe(1);
    expect(store.getState().lightPopover).toBe(torch);
    expect(store.getState().objects.lights[torch]!.emission).toMatchObject({ bright: 20, dim: 40, angle: 90 });
    undo();
    expect(store.getState().objects.lights[torch]!.rotation).toBe(90);
  });

  it('turn by whole degrees while Alt is held, and keep the handle under a pointer that grabbed it off-centre', () => {
    const { store, torch, press, move, up } = beam();
    // Grabbed 8 px below the handle's centre: 0.8° off the axis.
    press(982, 308);
    move(982, 308);
    expect(store.getState().objects.lights[torch]!.rotation).toBe(90);
    move(700, 595, true);
    up();
    expect(store.getState().objects.lights[torch]!.rotation).toBe(134);
  });

  it('leave a light that was never turned without a rotation when its first turn is cancelled', () => {
    const { store, torch, lights, press, move } = beam();
    store.setState((state) => {
      const { rotation: _rotation, ...unturned } = state.objects.lights[torch]!;
      return { objects: { ...state.objects, lights: { ...state.objects.lights, [torch]: unturned } } };
    });
    // Unturned, the beam faces up: its handle is above the light.
    press(400, 300 - 560 - 22);
    move(700, 300);
    expect(store.getState().objects.lights[torch]!.rotation).toBe(90);
    lights.cancel();
    expect('rotation' in store.getState().objects.lights[torch]!).toBe(false);
  });

  it('put the light back when the turn is cancelled, and leave no undo step', () => {
    const { store, torch, lights, press, move, steps } = beam();
    press(982, 300);
    move(400, 900);
    expect(lights.dragging).toBe(true);
    lights.cancel();
    expect(store.getState().objects.lights[torch]!.rotation).toBe(90);
    expect(steps()).toBe(0);
  });

  it('resize the beam\'s ranges from the handles on its edges', () => {
    const { store, torch, press, move, up } = beam();
    const edge = Math.SQRT1_2;
    expect(press(400 + 280 * edge, 300 - 280 * edge)).toBe(true);
    move(400 + 140 * edge, 300 - 140 * edge);
    up();
    expect(store.getState().objects.lights[torch]!.emission).toMatchObject({ bright: 10, dim: 40 });
  });
});
