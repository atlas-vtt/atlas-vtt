import { afterEach, describe, expect, it } from 'vitest';
import type { RemotePlayerState } from '../../src/api/types/remoteViews';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { RemoteViewScene } from '../../src/app/remote-view/RemoteViewScene';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => { document.body.replaceChildren(); });

function setup() {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-identity', undefined, false, { remote: true });
  const parent = document.body.createDiv();
  const scene = new RemoteViewScene({ app, viewId: 'remote-identity', atlasStore: store, containerEl: parent, renderer: null });
  const remote = (): NonNullable<ReturnType<typeof store.getState>['remoteView']> => {
    const state = store.getState().remoteView;
    if (!state) throw new Error('not a remote store');
    return state;
  };
  return { store, scene, remote };
}

/** A fresh state each call: equal by value, never the same objects. */
const player = (conditionName = 'Prone'): RemotePlayerState => ({
  movableTokenIds: ['hero'],
  measurement: resolveMeasurementSettings(undefined, null),
  tokenUi: {
    conditions: [{ id: 'prone', name: conditionName, color: '#ff4444' }],
    resources: { hero: [{ key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22aa44', visibleToPlayers: true }] },
  },
  initiative: { rules: { mode: 'sides', roll: '1d20', firstSide: 'players' }, health: { hero: { value: 3, max: 4 } } },
});

describe("a remote view's setPlayer", () => {
  it('keeps every part that did not change as the same object, and writes nothing when nothing changed', () => {
    const { store, scene, remote } = setup();
    scene.setPlayer(player());
    const before = remote();
    let writes = 0;
    const stop = store.subscribe(() => { writes++; });
    scene.setPlayer(player());
    stop();
    expect(writes).toBe(0);
    expect(remote()).toBe(before);
    expect(remote().initiativeRules).toBe(before.initiativeRules);
  });

  it('replaces only the part that changed: a renamed condition leaves the rules, resources and health alone', () => {
    const { scene, remote } = setup();
    scene.setPlayer(player());
    const before = remote();
    scene.setPlayer(player('Knocked down'));
    const after = remote();
    expect(after.conditions).not.toBe(before.conditions);
    expect(after.conditions[0]?.name).toBe('Knocked down');
    expect(after.initiativeRules).toBe(before.initiativeRules);
    expect(after.resources).toBe(before.resources);
    expect(after.initiativeHealth).toBe(before.initiativeHealth);
    expect(after.movableTokenIds).toBe(before.movableTokenIds);
    expect(after.measurement).toBe(before.measurement);
  });

  it('still takes a change of health, and keeps the parts it takes frozen', () => {
    const { scene, remote } = setup();
    scene.setPlayer(player());
    const before = remote();
    scene.setPlayer({ ...player(), initiative: { ...player().initiative, health: { hero: { value: 1, max: 4 } } } });
    expect(remote().initiativeHealth).toEqual({ hero: { current: 1, max: 4 } });
    expect(remote().initiativeRules).toBe(before.initiativeRules);
    expect(Object.isFrozen(remote().initiativeHealth)).toBe(true);
    expect(Object.isFrozen(remote().conditions)).toBe(true);
  });
});
