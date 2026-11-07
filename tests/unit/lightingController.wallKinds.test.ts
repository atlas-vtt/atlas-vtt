// @vitest-environment jsdom
// The harness first: it mocks what the controller imports.
import { contextMenuOpened, event, setup, type Setup } from './lightingControllerHarness';
import { describe, expect, it, vi } from 'vitest';
import { getHistoryStore } from '../../src/app/stores/history';
import type { WallSegment } from '../../src/app/types/wallTypes';

// Limited walls are switched off in the release (`LIMITED_WALLS`); the tests of their menu run with them on, so the parked code does not rot.
vi.mock('../../src/app/featureFlags', async (original) => ({ ...(await original<typeof import('../../src/app/featureFlags')>()), LIMITED_WALLS: true }));

interface Entry {
  type: string;
  label: string;
  checked?: boolean;
  onClick?: () => void;
  children?: Entry[];
}

/** The lighting tool with two walls, far from the lights: a wall along y = 100 and a door along y = 500. */
function withWalls(): Setup & { wall: string; door: string; steps: () => number; kind: (id: string) => WallSegment['blocks']; menu: (x: number, y: number) => Entry[] } {
  const made = setup();
  const { store } = made;
  store.getState().setActiveTool('wall');
  const wall = store.getState().addWall({ type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 } });
  const door = store.getState().addWall({ type: 'door', closed: true, p1: { x: 100, y: 500 }, p2: { x: 300, y: 500 } });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return {
    ...made, wall, door,
    steps: () => history.getState().pastStates.length,
    kind: (id) => store.getState().objects.walls[id]!.blocks,
    menu: (x, y) => {
      contextMenuOpened.mockClear();
      made.contextMenu(x, y, 10, 10);
      return contextMenuOpened.mock.calls[0]![0] as Entry[];
    },
  };
}

const blocksOf = (entries: Entry[]): Entry[] => entries.find((entry) => entry.label === 'Blocks')!.children!;
const checked = (entries: Entry[]): string[] => blocksOf(entries).filter((entry) => entry.checked).map((entry) => entry.label);

describe('the wall menu\'s Blocks', () => {
  it('offers three choices and ticks what the wall blocks', () => {
    const { wall, menu, store } = withWalls();
    const first = menu(200, 100);
    expect(first.find((entry) => entry.label === 'Blocks')!.type).toBe('submenu');
    expect(blocksOf(first).map((entry) => entry.label)).toEqual(['Sight and light', 'Sight only', 'Light only']);
    expect(checked(first)).toEqual(['Sight and light']);
    store.getState().updateWall(wall, { blocks: 'light' });
    expect(checked(menu(200, 100))).toEqual(['Light only']);
  });

  it('sets what a wall blocks as one undo step, and takes the kind away again', () => {
    const { wall, menu, kind, steps, store } = withWalls();
    blocksOf(menu(200, 100)).find((entry) => entry.label === 'Sight only')!.onClick!();
    expect(kind(wall)).toBe('sight');
    expect(steps()).toBe(1);
    expect(checked(menu(200, 100))).toEqual(['Sight only']);
    blocksOf(menu(200, 100)).find((entry) => entry.label === 'Sight and light')!.onClick!();
    expect(kind(wall)).toBeUndefined();
    expect('blocks' in store.getState().objects.walls[wall]!).toBe(false);
    expect(steps()).toBe(2);
    getHistoryStore(store)!.getState().undo();
    expect(kind(wall)).toBe('sight');
  });

  it('changes every selected wall alike in one undo step, and ticks nothing while they differ', () => {
    const { wall, door, menu, kind, steps, store, wallDown } = withWalls();
    store.getState().updateWall(door, { blocks: 'light' });
    const before = steps();
    // Both selected: a click on the wall, a Ctrl-click on the door.
    wallDown(200, 100, event(200, 100));
    wallDown(200, 500, { ...event(200, 500), ctrlKey: true } as never);
    const entries = menu(200, 100);
    expect(checked(entries)).toEqual([]);
    blocksOf(entries).find((entry) => entry.label === 'Sight only')!.onClick!();
    expect([kind(wall), kind(door)]).toEqual(['sight', 'sight']);
    expect(steps()).toBe(before + 1);
    expect(checked(menu(200, 100))).toEqual(['Sight only']);
  });

  it('keeps a door a door: it opens and locks as before, with its kind', () => {
    const { door, menu, kind, store } = withWalls();
    blocksOf(menu(200, 500)).find((entry) => entry.label === 'Light only')!.onClick!();
    expect(kind(door)).toBe('light');
    // The right-click that brought the menu selected the door and left it shut.
    expect(store.getState().objects.walls[door]!.closed).toBe(true);
    menu(200, 500).find((entry) => entry.label === 'Open door')!.onClick!();
    expect(store.getState().objects.walls[door]).toMatchObject({ type: 'door', closed: false, blocks: 'light' });
  });
});

describe('the wall menu\'s Limited', () => {
  const LIMITED = 'Limited (see past the first)';
  const limited = (entries: Entry[]): Entry => entries.find((entry) => entry.label === LIMITED)!;

  it('is a switch that makes a wall limited as one undo step, and takes it back', () => {
    const { wall, menu, steps, store } = withWalls();
    expect(limited(menu(200, 100)).checked).toBe(false);
    limited(menu(200, 100)).onClick!();
    expect(store.getState().objects.walls[wall]!.limited).toBe(true);
    expect(steps()).toBe(1);
    expect(limited(menu(200, 100)).checked).toBe(true);
    limited(menu(200, 100)).onClick!();
    expect('limited' in store.getState().objects.walls[wall]!).toBe(false);
    expect(steps()).toBe(2);
  });

  it('is off while the selected walls differ, and then makes them all limited in one undo step', () => {
    const { wall, door, menu, steps, store, wallDown } = withWalls();
    store.getState().updateWall(door, { limited: true });
    const before = steps();
    wallDown(200, 100, event(200, 100));
    wallDown(200, 500, { ...event(200, 500), ctrlKey: true } as never);
    const entries = menu(200, 100);
    expect(limited(entries).checked).toBe(false);
    limited(entries).onClick!();
    expect([store.getState().objects.walls[wall]!.limited, store.getState().objects.walls[door]!.limited]).toEqual([true, true]);
    expect(steps()).toBe(before + 1);
    // Both limited: the switch is on, and takes it from both.
    limited(menu(200, 100)).onClick!();
    expect(['limited' in store.getState().objects.walls[wall]!, 'limited' in store.getState().objects.walls[door]!]).toEqual([false, false]);
  });

  it('goes together with what a wall blocks', () => {
    const { wall, menu, store } = withWalls();
    limited(menu(200, 100)).onClick!();
    blocksOf(menu(200, 100)).find((entry) => entry.label === 'Sight only')!.onClick!();
    expect(store.getState().objects.walls[wall]).toMatchObject({ limited: true, blocks: 'sight' });
    expect(checked(menu(200, 100))).toEqual(['Sight only']);
    expect(limited(menu(200, 100)).checked).toBe(true);
  });

  it('stays with the wall when a door is placed in it: the door and both remainders are limited and block what the wall did', () => {
    const { wall, menu, store, wallDown } = withWalls();
    store.getState().updateWall(wall, { limited: true, blocks: 'light' });
    menu(200, 100).find((entry) => entry.label === 'Place door')!.onClick!();
    wallDown(200, 100, event(200, 100));
    const walls = Object.values(store.getState().objects.walls).filter((w) => w.p1.y === 100);
    expect(walls.map((w) => w.type).sort()).toEqual(['door', 'solid', 'solid']);
    for (const w of walls) expect(w).toMatchObject({ limited: true, blocks: 'light' });
  });
});


describe('a right-click on a wall with the wall tool', () => {
  it('selects an unselected wall by its end without taking hold of the end', () => {
    const { wall, menu, store, steps, wallMove, kind } = withWalls();
    // The wall's first end: a press there with the primary button drags the end.
    const entries = menu(100, 100);
    expect(blocksOf(entries)).toHaveLength(3);
    // The pointer moves on with no button held: the end stays where it is.
    wallMove(140, 160, event(140, 160));
    expect(store.getState().objects.walls[wall]!.p1).toEqual({ x: 100, y: 100 });
    // And what the menu does next is an undo step of its own, not part of a drag that never ended.
    blocksOf(entries).find((entry) => entry.label === 'Sight only')!.onClick!();
    expect([kind(wall), steps()]).toEqual(['sight', 1]);
  });

  it('keeps a selection of several walls when one of them is right-clicked by its end', () => {
    const { wall, door, menu, wallDown, kind } = withWalls();
    wallDown(200, 100, event(200, 100));
    wallDown(200, 500, { ...event(200, 500), ctrlKey: true } as never);
    blocksOf(menu(100, 500)).find((entry) => entry.label === 'Light only')!.onClick!();
    expect([kind(wall), kind(door)]).toEqual(['light', 'light']);
  });
});
