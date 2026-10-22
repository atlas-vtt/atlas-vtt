// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Graphics, Sprite } from 'pixi.js';
import { DoorIcons, badgeLook } from '../../src/app/pixi/lighting/DoorIcons';
import { doorMenuEntries } from '../../src/app/pixi/lighting/lightingMenus';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeVisibility } from '../../src/app/vision/visibility';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
});

interface Setup {
  store: ViewAtlasStore;
  /** A closed door from (0, 100) to (100, 100): its badge is at (50, 100). */
  door: string;
  wall: () => WallSegment;
  steps: () => number;
  undo: () => void;
}

function setup(): Setup {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `locked-doors-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/doors.atlasmap');
  const door = store.getState().addWall({ type: 'door', p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, closed: true });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return { store, door, wall: () => store.getState().objects.walls[door]!, steps: () => history.getState().pastStates.length, undo: () => history.getState().undo() };
}

function icons(store: ViewAtlasStore, reducedMotion = false): DoorIcons {
  const restoreGraphics = stubJsdomGraphics();
  window.matchMedia = (() => ({ matches: reducedMotion })) as never;
  const made = new DoorIcons(store, document.createElement('canvas'));
  cleanup = () => {
    made.destroy();
    restoreGraphics();
  };
  return made;
}

describe('a locked door', () => {
  it('is locked and unlocked in one undo step each, and stores nothing once unlocked', () => {
    const { store, door, wall, steps, undo } = setup();
    store.getState().setDoorLocked(door, true);
    expect(wall().locked).toBe(true);
    expect(steps()).toBe(1);
    store.getState().setDoorLocked(door, false);
    expect('locked' in wall()).toBe(false);
    expect(steps()).toBe(2);
    undo();
    expect(wall().locked).toBe(true);
  });

  it('does not open until it is unlocked; locking an open door closes it', () => {
    const { store, door, wall } = setup();
    store.getState().toggleDoor(door);
    expect(wall().closed).toBe(false);
    store.getState().setDoorLocked(door, true);
    expect(wall()).toMatchObject({ closed: true, locked: true });
    store.getState().toggleDoor(door);
    expect(wall().closed).toBe(true);
    store.getState().setDoorLocked(door, false);
    store.getState().toggleDoor(door);
    expect(wall().closed).toBe(false);
  });

  it('is no lock on a wall that is no door', () => {
    const { store } = setup();
    const solid = store.getState().addWall({ type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, closed: true });
    store.getState().setDoorLocked(solid, true);
    expect('locked' in store.getState().objects.walls[solid]!).toBe(false);
  });

  it('blocks light and sight exactly as a closed door does', () => {
    const closed: WallSegment = { id: 'd', kind: 'wall', type: 'door', p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, closed: true };
    expect(computeVisibility({ x: 50, y: 50 }, 300, [{ ...closed, locked: true }])).toEqual(computeVisibility({ x: 50, y: 50 }, 300, [closed]));
  });
});

describe('the badge of a locked door', () => {
  const fills = (badges: DoorIcons): number => (badges.view.children[0] as Graphics).context.instructions.filter((instruction) => instruction.action === 'fill').length;

  it('shows a lock', () => {
    const { store, door } = setup();
    const badges = icons(store);
    const plain = fills(badges);
    store.getState().setDoorLocked(door, true);
    expect(fills(badges)).toBeGreaterThan(plain);
  });

  it('does not open the door on a click and shakes instead, for a moment', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { store, door, wall, steps } = setup();
    store.getState().setDoorLocked(door, true);
    const before = steps();
    const badges = icons(store);
    expect(badges.hitTest(50, 100)).toBe(door);
    badges.toggle(door);
    expect(wall().closed).toBe(true);
    expect(steps()).toBe(before);
    expect(badges.refusal()).toMatchObject({ doorId: door, tint: false });
    vi.advanceTimersByTime(100);
    expect(Math.abs(badges.refusal()!.offset)).toBeGreaterThan(0);
    vi.advanceTimersByTime(600);
    expect(badges.refusal()).toBeNull();
  });

  it('does not shake where motion is reduced: it takes a tint for a moment', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { store, door } = setup();
    store.getState().setDoorLocked(door, true);
    const badges = icons(store, true);
    badges.toggle(door);
    vi.advanceTimersByTime(100);
    expect(badges.refusal()).toEqual({ doorId: door, offset: 0, tint: true });
    vi.advanceTimersByTime(600);
    expect(badges.refusal()).toBeNull();
  });

  it('opens an unlocked door as ever', () => {
    const { store, door, wall } = setup();
    const badges = icons(store);
    badges.toggle(door);
    expect(wall().closed).toBe(false);
    expect(badges.refusal()).toBeNull();
  });
});

describe('a door\'s menu', () => {
  const labels = (store: ViewAtlasStore, door: string): string[] => doorMenuEntries(store, door).flatMap((entry) => (entry.type === 'item' ? [entry.label] : []));
  const click = (store: ViewAtlasStore, door: string, label: string): void => {
    const entry = doorMenuEntries(store, door).find((candidate) => candidate.type === 'item' && candidate.label === label);
    if (entry?.type !== 'item') throw new Error(`no ${label}`);
    entry.onClick?.();
  };

  it('opens and closes the door and locks it; a locked door can only be unlocked', () => {
    const { store, door, wall } = setup();
    expect(labels(store, door)).toEqual(['Open door', 'Lock door']);
    click(store, door, 'Open door');
    expect(wall().closed).toBe(false);
    expect(labels(store, door)).toEqual(['Close door', 'Lock door']);
    click(store, door, 'Lock door');
    expect(wall()).toMatchObject({ closed: true, locked: true });
    expect(labels(store, door)).toEqual(['Unlock door']);
    click(store, door, 'Unlock door');
    expect('locked' in wall()).toBe(false);
  });

  it('has nothing for a wall that is no door', () => {
    const { store } = setup();
    const solid = store.getState().addWall({ type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, closed: true });
    expect(doorMenuEntries(store, solid)).toEqual([]);
  });
});

describe('a door\'s badge', () => {
  /** The door glyphs in the GM's badges: every child after the drawing of the discs. */
  const glyphs = (badges: DoorIcons): Sprite[] => badges.view.children.slice(1) as Sprite[];

  it('shows the door shut or swung open, and only the padlock while it is locked', () => {
    const { store, door } = setup();
    const badges = icons(store);
    expect(glyphs(badges)).toHaveLength(1);
    const [glyph] = glyphs(badges);
    const shut = glyph!.texture;
    store.getState().toggleDoor(door);
    expect(glyphs(badges)).toEqual([glyph]);
    expect(glyph!.texture).not.toBe(shut);
    store.getState().setDoorLocked(door, true);
    expect(glyphs(badges)).toEqual([]);
    store.getState().setDoorLocked(door, false);
    expect(glyphs(badges).map((sprite) => sprite.texture)).toEqual([shut]);
  });

  it('tells the players nothing but that there is a door: a locked one looks closed', () => {
    expect(badgeLook({ type: 'door', locked: true }, true)).toEqual({ secret: false, lock: false });
    expect(badgeLook({ type: 'secret-door' }, true)).toEqual({ secret: false, lock: false });
  });

  it('shows the GM the padlock and the secret door', () => {
    expect(badgeLook({ type: 'door', locked: true }, false)).toEqual({ secret: false, lock: true });
    expect(badgeLook({ type: 'secret-door' }, false)).toEqual({ secret: true, lock: false });
  });
});
