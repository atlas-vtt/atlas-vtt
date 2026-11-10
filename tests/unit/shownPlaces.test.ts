import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { glideWayIsClear, wayIsClear } from '../../src/app/lighting/glideWay';
import { ShownPlaces } from '../../src/app/lighting/shownPlaces';
import { followShownPlaces, withShownPlaces } from '../../src/app/lighting/shownTokens';
import type { TokenEntity } from '../../src/app/types';
import type { WallSegment } from '../../src/app/types/wallTypes';

const token = (id: string, x: number, y: number): TokenEntity => ({ id, kind: 'token', imagePath: '', x, y });
const wall = (x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment =>
  ({ id: `${x1},${y1}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, closed: true, ...extra });

describe('tokens read where they are drawn', () => {
  it('reads the state itself while no token is drawn elsewhere', () => {
    const state = { objects: { tokens: { hero: token('hero', 10, 10) } } };
    const shown = new ShownPlaces();
    expect(withShownPlaces(state, shown)).toBe(state);
    shown.set('hero', 10.1, 10);
    expect(withShownPlaces(state, shown)).toBe(state);
  });

  it('moves a gliding token to its drawn place and leaves the others as they are', () => {
    const state = { objects: { tokens: { hero: token('hero', 70, 0), foe: token('foe', 5, 5) } } };
    const shown = new ShownPlaces();
    shown.set('hero', 30, 0);
    shown.set('gone', 1, 1);
    const read = withShownPlaces(state, shown);
    expect(read.objects.tokens.hero).toMatchObject({ x: 30, y: 0 });
    expect(read.objects.tokens.foe).toBe(state.objects.tokens.foe);
    expect(read.objects.tokens.gone).toBeUndefined();
  });

  it('hears a glide step once per flush, and reads the same object between changes', () => {
    const store = createStore(() => ({ objects: { tokens: { hero: token('hero', 70, 0) } } }));
    const shown = new ShownPlaces();
    const scene = followShownPlaces(store, shown);
    const heard = vi.fn();
    const off = scene.subscribe(heard);
    shown.set('hero', 20, 0);
    expect(heard).not.toHaveBeenCalled();
    shown.flush();
    shown.flush();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0]![0].objects.tokens.hero.x).toBe(20);
    expect(heard.mock.calls[0]![1].objects.tokens.hero.x).toBe(70);
    expect(scene.getState()).toBe(scene.getState());
    shown.delete('hero');
    shown.flush();
    expect(scene.getState()).toBe(store.getState());
    off();
    store.setState({ objects: { tokens: {} } });
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe('the ways a token may be drawn on', () => {
  const bounds = { width: 512, height: 512 };
  const lit = (walls: WallSegment[], enabled = true) => ({ objects: { walls: Object.fromEntries(walls.map((w) => [w.id, w])) }, lighting: { enabled } });

  it('is clear beside a wall and through an open door, not across a wall or a closed door', () => {
    const divider = wall(100, 0, 100, 200);
    expect(wayIsClear([divider], { x: 50, y: 20 }, { x: 50, y: 180 })).toBe(true);
    expect(wayIsClear([divider], { x: 50, y: 20 }, { x: 150, y: 20 })).toBe(false);
    expect(wayIsClear([wall(100, 0, 100, 200, { type: 'door', closed: false })], { x: 50, y: 20 }, { x: 150, y: 20 })).toBe(true);
    expect(wayIsClear([wall(100, 0, 100, 200, { type: 'door', closed: true })], { x: 50, y: 20 }, { x: 150, y: 20 })).toBe(false);
  });

  it('is not clear through a gap the lighting closes between two walls', () => {
    const scene = lit([wall(100, 0, 100, 96), wall(100, 102, 100, 200)]);
    expect(glideWayIsClear(scene, bounds, { x: 50, y: 99 }, { x: 150, y: 99 })).toBe(false);
  });

  it('is clear everywhere on a scene without lighting', () => {
    const scene = lit([wall(100, 0, 100, 200)], false);
    expect(glideWayIsClear(scene, bounds, { x: 50, y: 20 }, { x: 150, y: 20 })).toBe(true);
    expect(glideWayIsClear(lit([wall(100, 0, 100, 200)]), null, { x: 50, y: 20 }, { x: 150, y: 20 })).toBe(true);
  });
});
