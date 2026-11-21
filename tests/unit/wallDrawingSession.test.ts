import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { WallDrawingSession } from '../../src/app/pixi/lighting/WallDrawingSession';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function setup(): { store: ReturnType<typeof createViewAtlasStore>; session: WallDrawingSession; steps: () => number } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `walls-${Math.random()}`);
  store.setState({ persistenceEnabled: false });
  const history = getHistoryStore(store)!;
  return { store, session: new WallDrawingSession(store), steps: () => history.getState().pastStates.length };
}

const segment = (x: number): { type: 'solid'; p1: { x: number; y: number }; p2: { x: number; y: number } } =>
  ({ type: 'solid', p1: { x, y: 0 }, p2: { x: x + 10, y: 0 } });

describe('WallDrawingSession', () => {
  it('makes a whole chain one undo step', () => {
    const { store, session, steps } = setup();
    const before = steps();
    session.start();
    session.add(segment(0));
    session.add(segment(10));
    session.add(segment(20));
    session.finish();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(3);
    expect(steps()).toBe(before + 1);
  });

  it('leaves nothing, not even an undo step, when the chain is cancelled', () => {
    const { store, session, steps } = setup();
    const before = steps();
    session.start();
    session.add(segment(0));
    session.add(segment(10));
    session.cancel();
    expect(store.getState().objects.walls).toEqual({});
    expect(steps()).toBe(before);
  });

  it('closes the previous chain when a new one starts', () => {
    const { session, steps } = setup();
    const before = steps();
    session.start();
    session.add(segment(0));
    session.start();
    session.add(segment(10));
    session.finish();
    expect(steps()).toBe(before + 2);
    expect(session.active).toBe(false);
  });

  it('records other edits normally while a chain has no segment yet', () => {
    const { store, session, steps } = setup();
    const before = steps();
    session.start();
    store.getState().addWall(segment(50));
    expect(steps()).toBe(before + 1);
    session.cancel();
    expect(steps()).toBe(before + 1);
  });

  it('keeps unrelated edits made while a chain is cancelled', () => {
    const { store, session } = setup();
    const doorId = store.getState().addWall({ ...segment(100), type: 'door', closed: true });
    session.start();
    session.add(segment(0));
    store.getState().toggleDoor(doorId);
    session.cancel();
    const walls = store.getState().objects.walls;
    expect(Object.keys(walls)).toEqual([doorId]);
    expect(walls[doorId]!.closed).toBe(false);
  });

  it('takes back the wall placed last and goes on: one step for what is left, none where nothing is', () => {
    const { store, session, steps } = setup();
    const before = steps();
    session.start();
    session.add(segment(0));
    session.add(segment(10));
    session.removeLast();
    expect(Object.values(store.getState().objects.walls).map((wall) => wall.p1.x)).toEqual([0]);
    session.finish();
    expect(steps()).toBe(before + 1);

    session.start();
    session.add(segment(20));
    session.removeLast();
    session.removeLast();
    session.finish();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    expect(steps()).toBe(before + 1);
    // A chain that goes on after losing its only wall begins its step anew.
    session.start();
    session.add(segment(30));
    session.removeLast();
    session.add(segment(40));
    session.finish();
    expect(steps()).toBe(before + 2);
  });
});
