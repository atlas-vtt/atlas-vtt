import { describe, expect, it } from 'vitest';
import { measureList } from '../../../../src/app/measure/keptMeasures';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { GmMeasures } from '../../../../src/app/online/gm/gmMeasures.ts';
import { PlayerMeasures } from '../../../../src/app/online/gm/playerMeasures.ts';
import { MAX_KEPT, parsePlayerMessage, type FullMeasure, type PlayerMessage } from '../../../../src/app/online/protocol/index.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = { width: 1000, height: 800 };

/** A scene store as far as measurements go: a write replaces the state, as Atlas's does. */
function sceneStore(): SceneStore {
  let state = { objects: { measures: {} } } as unknown as SceneState;
  return {
    getState: () => state,
    setState: (recipe) => {
      const draft = structuredClone(state);
      recipe(draft);
      state = draft;
    },
    subscribe: () => () => undefined,
  };
}

function table(seated: readonly string[] = [ANA, BEN]): { store: SceneStore; measures: PlayerMeasures; clock: { now: number }; kept: () => ReturnType<typeof measureList> } {
  const store = sceneStore();
  const clock = { now: 0 };
  const measures = new PlayerMeasures(store, { now: () => clock.now, seated: (player) => seated.includes(player), scene: () => 's1', map: () => MAP });
  return { store, measures, clock, kept: () => measureList(store.getState().objects.measures) };
}

const cone: FullMeasure = { shape: 'cone', pts: [100, 100, 300, 100] };
const keep = (measure: object, scene = 's1'): Extract<PlayerMessage, { t: 'measure-keep' }> => {
  const read = parsePlayerMessage({ t: 'measure-keep', scene, measure });
  if (read?.t !== 'measure-keep') throw new Error('not read');
  return read;
};
const drop = (ids: readonly string[], scene = 's1'): Extract<PlayerMessage, { t: 'measure-drop' }> => {
  const read = parsePlayerMessage({ t: 'measure-drop', scene, ids });
  if (read?.t !== 'measure-drop') throw new Error('not read');
  return read;
};

describe('the measurements players keep', () => {
  it('are the scene\'s own from then on: a kept measurement with its keeper, and nothing of a look a page names', () => {
    const { measures, kept } = table();
    measures.receive(ANA, keep({ ...cone, free: true, color: '#ff0000', effect: 'fire', by: BEN, id: 'x' }));
    expect(kept()).toHaveLength(1);
    const [made] = kept();
    expect(made).toMatchObject({ kind: 'measure', shape: 'cone', points: [{ x: 100, y: 100 }, { x: 300, y: 100 }], walls: false, by: ANA });
    expect(made).not.toHaveProperty('color');
    expect(made).not.toHaveProperty('effect');
    // The GM changes it as any of its own, and it stays its keeper's
    expect(measures.told(made!)).toEqual({ by: ANA, id: expect.stringMatching(/^[0-9a-z]{1,8}$/) });
  });

  it('are taken only from a player at the table, for the scene they see, near the map, within their number and rate', () => {
    const { measures, kept, clock } = table([ANA]);
    measures.receive(BEN, keep(cone));
    measures.receive(ANA, keep(cone, 's2'));
    measures.receive(ANA, keep({ shape: 'circle', pts: [90000, 90000, 90100, 90000] }));
    expect(kept()).toHaveLength(0);
    clock.now += 60_000;
    for (let index = 0; index < MAX_KEPT + 5; index += 1) measures.receive(ANA, keep(cone));
    expect(kept()).toHaveLength(MAX_KEPT);
    // Later, at their rate again, they still have as many as they may
    clock.now += 60_000;
    measures.receive(ANA, keep(cone));
    expect(kept()).toHaveLength(MAX_KEPT);
  });

  it('are let go by their keeper alone, by the ids that keeper was told', () => {
    const { measures, kept } = table();
    measures.receive(ANA, keep(cone));
    measures.receive(BEN, keep({ shape: 'circle', pts: [400, 400, 470, 400] }));
    const [anas, bens] = kept();
    const anasId = measures.told(anas!)!.id;
    const bensId = measures.told(bens!)!.id;
    // Ben names Ana's id (the same word, counted per player), an unknown one and one that is no id
    measures.receive(BEN, drop([anasId === bensId ? 'zz' : anasId, 'zz']));
    expect(parsePlayerMessage({ t: 'measure-drop', scene: 's1', ids: ['../x'] })).toBeNull();
    expect(kept().map((measure) => measure.by)).toEqual([ANA, BEN]);
    measures.receive(ANA, drop([anasId]));
    expect(kept().map((measure) => measure.by)).toEqual([BEN]);
    // What is gone is let go once: the id names nothing any more
    measures.receive(ANA, drop([anasId]));
    expect(kept()).toHaveLength(1);
  });

  it('are told to everyone among the GM\'s own, with their keeper and the id they go by', () => {
    const { measures, kept } = table();
    measures.receive(ANA, keep(cone));
    const gm = new GmMeasures();
    gm.follow({ live: null, kept: [...kept(), { id: 'own', kind: 'measure', shape: 'circle', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] }] }, { footprints: () => [], seen: () => () => true }, 0);
    const told = gm.shown(() => true, undefined, (measure) => measures.told(measure)).full.kept;
    expect(told).toEqual([{ shape: 'cone', pts: [100, 100, 300, 100], by: ANA, id: measures.told(kept()[0]!)!.id }, { shape: 'circle', pts: [0, 0, 70, 0] }]);
  });
});
