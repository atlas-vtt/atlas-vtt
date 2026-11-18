// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { TOUCH_SLOP_PX } from '../../../src/app/input/longPress';
import { watchInput } from '../../../src/app/packages/components/primitives/lastInput';
import { PinRenderer } from '../../../src/app/pixi/PinRenderer';
import { closesDraft } from '../../../src/app/pixi/areas/areaGeometry';
import { HANDLE_HIT_RADIUS, ringHandleAt, ringHandlePoint, type RingGeometry } from '../../../src/app/pixi/lighting/lightRingGeometry';
import { wallEndNear } from '../../../src/app/pixi/lighting/wallEnds';
import {
  doubleClickSlack, dragThreshold, fingerReaches, FINGER_REACH_SCALE, isFinger, pointerReach, ReachPick, tokenDragDistance, withFineReach,
} from '../../../src/app/pixi/utils/pointerReach';
import { COARSE_POINTER_SCALE } from '../../../src/app/platform/deviceProfile';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { EventEmitter } from '../../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

// jsdom has no 2D canvas, so pin glyphs cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/pinIconTexture', () => ({ createPinIconTexture: vi.fn(() => new Texture()) }));

/** A pointer event as a device of `kind` sends it; jsdom's own events carry no pointer type. */
function use(kind: 'mouse' | 'pen' | 'touch'): void {
  const event = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: kind });
  document.body.dispatchEvent(event);
}

let stopWatching: () => void = () => undefined;

beforeEach(() => {
  stopWatching = watchInput(document);
  use('mouse');
});

afterEach(() => {
  // The next file starts as the app does: with a mouse.
  use('mouse');
  stopWatching();
});

describe('the reach of the pointer in use', () => {
  it('is a mouse\'s until a finger is used, and a mouse\'s again once the mouse moves', () => {
    expect(pointerReach(1)).toBe(1);
    expect(pointerReach(11)).toBe(11);
    use('touch');
    expect(isFinger()).toBe(true);
    expect(pointerReach(1)).toBe(FINGER_REACH_SCALE);
    expect(pointerReach(11)).toBe(22);
    use('mouse');
    expect(pointerReach(11)).toBe(11);
  });

  it('leaves a pen with a mouse\'s reach and thresholds: it points as finely', () => {
    use('pen');
    expect(isFinger()).toBe(false);
    expect(pointerReach(11)).toBe(11);
    expect(dragThreshold(5)).toBe(5);
  });

  it('goes by the event\'s own pointer where the caller has one, whatever was used last', () => {
    use('mouse');
    expect(pointerReach(10, { pointerType: 'touch' })).toBe(20);
    use('touch');
    expect(pointerReach(10, { pointerType: 'mouse' })).toBe(10);
    expect(dragThreshold(5, { pointerType: 'pen' })).toBe(5);
  });

  it('is still a finger\'s after a key was pressed: keys say nothing about what points', () => {
    use('touch');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(isFinger()).toBe(true);
  });

  it('is a mouse\'s inside withFineReach, while drags keep a finger\'s threshold', () => {
    use('touch');
    withFineReach(() => {
      expect(fingerReaches()).toBe(false);
      expect(pointerReach(10)).toBe(10);
      expect(dragThreshold(5)).toBe(8);
    });
    expect(fingerReaches()).toBe(true);
    expect(() => withFineReach(() => { throw new Error('thrown inside'); })).toThrow('thrown inside');
    expect(fingerReaches()).toBe(true);
  });

  it('shares its numbers with the device profile and the long press', () => {
    expect(COARSE_POINTER_SCALE).toBe(FINGER_REACH_SCALE);
    expect(dragThreshold(5, { pointerType: 'touch' })).toBe(TOUCH_SLOP_PX);
  });
});

describe('drag thresholds', () => {
  it('are each tool\'s own for a mouse and 8 px for a finger, never less than the tool\'s', () => {
    for (const px of [3, 4, 5]) {
      expect(dragThreshold(px)).toBe(px);
      expect(dragThreshold(px, { pointerType: 'touch' })).toBe(8);
    }
    expect(dragThreshold(12, { pointerType: 'touch' })).toBe(12);
  });

  it('start a token\'s drag after 5 world px for a mouse and 8 screen px for a finger, at any zoom', () => {
    expect(tokenDragDistance({ scale: { x: 0.5 } })).toBe(5);
    expect(tokenDragDistance({ scale: { x: 2 } })).toBe(5);
    const finger = { pointerType: 'touch' };
    expect(tokenDragDistance({ scale: { x: 0.5 } }, finger)).toBe(16);
    expect(tokenDragDistance({ scale: { x: 1 } }, finger)).toBe(8);
    // Zoomed in, 5 world px are already more than a finger wanders
    expect(tokenDragDistance({ scale: { x: 2 } }, finger)).toBe(5);
  });

  it('give the two taps of a finger\'s double tap 40 px, a mouse\'s double click its own slack', () => {
    expect(doubleClickSlack(6)).toBe(6);
    expect(doubleClickSlack(6, { pointerType: 'touch' })).toBe(40);
  });
});

describe('a light ring\'s handle', () => {
  const geometry: RingGeometry = { center: { x: 100, y: 100 }, radius: { bright: 40, dim: 80 } };
  const bright = ringHandlePoint(geometry, 'bright');
  const off = (px: number, zoom: number): { x: number; y: number } => ({ x: bright.x + px / zoom, y: bright.y });

  it('takes a mouse within 11 screen px and a finger within 22, at any zoom', () => {
    for (const zoom of [0.5, 1, 2.5]) {
      use('mouse');
      expect(ringHandleAt(geometry, off(HANDLE_HIT_RADIUS - 1, zoom), zoom)).toBe('bright');
      expect(ringHandleAt(geometry, off(16, zoom), zoom)).toBeNull();
      use('touch');
      expect(ringHandleAt(geometry, off(16, zoom), zoom)).toBe('bright');
      expect(ringHandleAt(geometry, off(21, zoom), zoom)).toBe('bright');
      expect(ringHandleAt(geometry, off(23, zoom), zoom)).toBeNull();
    }
  });

  it('gives a finger between two handles the nearer one', () => {
    // Rings 30 px apart on screen: both handles lie within a finger's reach of the point between them
    const close: RingGeometry = { center: { x: 0, y: 0 }, radius: { bright: 10, dim: 20 } };
    use('touch');
    expect(ringHandleAt(close, { x: 0, y: 12 }, 1)).toBe('dim');
    expect(ringHandleAt(close, { x: 0, y: 3 }, 1)).toBe('bright');
  });
});

describe('a pin', () => {
  let renderer: PinRenderer;
  let viewport: Viewport;
  let pinAt: (x: number, y: number) => string;

  beforeEach(() => {
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
    const { app } = createInMemoryApp({ files: { 'note.md': '# Note' } });
    const store = createViewAtlasStore(app, `reach-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/reach.atlasmap');
    renderer = new PinRenderer(viewport, new EventEmitter(), store);
    // A small map: its pins are dots 12 px across, far smaller than what takes a press
    renderer.setMapSize(() => ({ width: 200, height: 200 }));
    pinAt = (x, y) => store.getState().addNotePin(x, y, 'note.md');
  });

  afterEach(() => {
    renderer.destroy();
    viewport.destroy();
  });

  it('shrunk to a dot takes a mouse within 10 screen px and a finger within 20', () => {
    const pin = pinAt(100, 100);
    use('mouse');
    expect(renderer.hitTestPins(109, 100)).toBe(pin);
    expect(renderer.hitTestPins(116, 100)).toBeNull();
    use('touch');
    expect(renderer.hitTestPins(116, 100)).toBe(pin);
    expect(renderer.hitTestPins(121, 100)).toBeNull();
  });

  it('gives a finger between two pins the nearer one, and a mouse the first it finds, as ever', () => {
    const left = pinAt(100, 100);
    const right = pinAt(124, 100);
    use('touch');
    expect(renderer.hitTestPins(110, 100)).toBe(left);
    expect(renderer.hitTestPins(115, 100)).toBe(right);
    use('mouse');
    expect(renderer.hitTestPins(115, 100)).toBe(right);
    expect(renderer.hitTestPins(112, 100)).toBeNull();
  });

  it('keeps its mouse\'s reach under a finger inside withFineReach', () => {
    const pin = pinAt(100, 100);
    use('touch');
    expect(withFineReach(() => renderer.hitTestPins(116, 100))).toBeNull();
    expect(withFineReach(() => renderer.hitTestPins(109, 100))).toBe(pin);
  });
});

describe('what a finger joins and closes', () => {
  const wall: WallSegment = { id: 'w', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, type: 'wall' } as WallSegment;

  it('lands on a wall end within 10 screen px for a mouse and 20 for a finger', () => {
    use('mouse');
    expect(wallEndNear({ x: 116, y: 0 }, { w: wall }, 1)).toBeNull();
    expect(wallEndNear({ x: 108, y: 0 }, { w: wall }, 1)).toEqual({ x: 100, y: 0 });
    use('touch');
    expect(wallEndNear({ x: 116, y: 0 }, { w: wall }, 1)).toEqual({ x: 100, y: 0 });
    // The reach is the screen's: zoomed out to a quarter, 20 px are 80 of the map's
    expect(wallEndNear({ x: 170, y: 0 }, { w: wall }, 0.25)).toEqual({ x: 100, y: 0 });
    expect(wallEndNear({ x: 190, y: 0 }, { w: wall }, 0.25)).toBeNull();
  });

  it('closes an area on its first corner for both, and on the corner placed last for a finger: its double tap', () => {
    const draft = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    use('mouse');
    expect(closesDraft(draft, { x: 4, y: 3 }, 1)).toBe(true);
    expect(closesDraft(draft, { x: 100, y: 100 }, 1)).toBe(false);
    use('touch');
    expect(closesDraft(draft, { x: 14, y: 3 }, 1)).toBe(true);
    expect(closesDraft(draft, { x: 108, y: 94 }, 1)).toBe(true);
    expect(closesDraft(draft, { x: 100, y: 50 }, 1)).toBe(false);
    // Two corners are no area yet
    expect(closesDraft(draft.slice(0, 2), { x: 100, y: 0 }, 1)).toBe(false);
  });
});

describe('which of the things in reach a press takes', () => {
  /** Offers things at their distances in turn, as a hit test's loop does; returns what was taken and how many were looked at. */
  function search(pick: ReachPick<string>, reach: number, things: Array<[string, number]>, within = true): { taken: string | null; offered: number } {
    pick.begin(reach, within);
    let offered = 0;
    for (const [name, distance] of things) {
      offered++;
      if (pick.offer(name, distance) && pick.over) break;
    }
    return { taken: pick.taken, offered };
  }
  const things: Array<[string, number]> = [['far', 9], ['near', 2], ['nearest', 1], ['beyond', 30]];

  it('is the first in order for a mouse, which looks no further', () => {
    expect(search(new ReachPick<string>(), 10, things)).toEqual({ taken: 'far', offered: 1 });
  });

  it('is the nearest for a finger, whose reach takes in neighbours', () => {
    use('touch');
    expect(search(new ReachPick<string>(), 10, things)).toEqual({ taken: 'nearest', offered: 4 });
  });

  it('is the first in order for a finger whose press lies on something else (`withFineReach`)', () => {
    use('touch');
    expect(withFineReach(() => search(new ReachPick<string>(), 10, things))).toEqual({ taken: 'far', offered: 1 });
  });

  it('is nothing where nothing is in reach, and what lies exactly at its end is in it unless said otherwise', () => {
    const pick = new ReachPick<string>();
    expect(search(pick, 10, [['beyond', 30]]).taken).toBeNull();
    expect(search(pick, 10, [['edge', 10]]).taken).toBe('edge');
    expect(search(pick, 10, [['edge', 10]], false).taken).toBeNull();
  });

  it('starts anew with every search: one pick serves every hit test of its owner', () => {
    use('touch');
    const pick = new ReachPick<string>();
    expect(search(pick, 10, things).taken).toBe('nearest');
    expect(search(pick, 10, [['other', 8]]).taken).toBe('other');
    expect(search(pick, 10, []).taken).toBeNull();
  });
});
