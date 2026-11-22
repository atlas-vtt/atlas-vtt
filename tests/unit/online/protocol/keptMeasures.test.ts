import { describe, expect, it } from 'vitest';
import { GM_LEVEL, MAX_MARK_KEPT, MEASURE_KEEP_GM_LEVEL, parseGmMessage, parsePlayerMessage } from '../../../../src/app/online/protocol/index.ts';

const PLAYER = 'a'.repeat(20);
const cone = { shape: 'cone', pts: [0, 0, 70, 0] };
const marks = (kept: readonly object[]): object => ({ t: 'marks', scene: 's1', lasers: [], measures: [{ who: 'gm', color: '#123456', live: null, kept: [], full: { live: null, kept } }] });

describe('measurements a player keeps in the scene', () => {
  it('are asked for and let go in messages a GM of the level reads', () => {
    expect(GM_LEVEL).toBeGreaterThanOrEqual(MEASURE_KEEP_GM_LEVEL);
    expect(parsePlayerMessage({ t: 'measure-keep', scene: 's1', measure: cone, more: 1 })).toEqual({ t: 'measure-keep', scene: 's1', measure: cone });
    expect(parsePlayerMessage({ t: 'measure-drop', scene: 's1', ids: ['1', 'a9'] })).toEqual({ t: 'measure-drop', scene: 's1', ids: ['1', 'a9'] });
  });

  it('read nothing of a player\'s but what the measurement measures: no keeper, id, colour or look of their saying', () => {
    const said = { shape: 'circle', pts: [0, 0, 70, 0], free: true, by: 'b'.repeat(20), id: '7', color: '#ff0000', effect: 'fire' };
    expect(parsePlayerMessage({ t: 'measure-keep', scene: 's1', measure: said })).toEqual({ t: 'measure-keep', scene: 's1', measure: { shape: 'circle', pts: [0, 0, 70, 0], free: true } });
  });

  it('are refused where malformed: no measurement, no scene, no ids, too many, or one that is no id', () => {
    expect(parsePlayerMessage({ t: 'measure-keep', scene: 's1', measure: { shape: 'cone', pts: [0, 0] } })).toBeNull();
    expect(parsePlayerMessage({ t: 'measure-keep', scene: '', measure: cone })).toBeNull();
    expect(parsePlayerMessage({ t: 'measure-drop', scene: 's1', ids: [] })).toBeNull();
    expect(parsePlayerMessage({ t: 'measure-drop', scene: 's1', ids: Array.from({ length: MAX_MARK_KEPT + 1 }, () => '1') })).toBeNull();
    for (const id of ['', 'A', 'x'.repeat(9), 3, null]) expect(parsePlayerMessage({ t: 'measure-drop', scene: 's1', ids: [id] }), String(id)).toBeNull();
  });

  it('are told with their keeper and the id they go by, both or neither', () => {
    expect(parseGmMessage(marks([{ ...cone, by: PLAYER, id: '1' }]))).toEqual(marks([{ ...cone, by: PLAYER, id: '1' }]));
    // Half of it, or a keeper that is no player's id, reads as a measurement of the GM's own: the measurement still shows
    for (const half of [{ by: PLAYER }, { id: '1' }, { by: 'nobody', id: '1' }, { by: PLAYER, id: 'NO' }]) expect(parseGmMessage(marks([{ ...cone, ...half }])), JSON.stringify(half)).toEqual(marks([cone]));
  });
});
