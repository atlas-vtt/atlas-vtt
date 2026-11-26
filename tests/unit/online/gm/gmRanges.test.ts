import { describe, expect, it } from 'vitest';
import { GmMeasures, type PlayersView } from '../../../../src/app/online/gm/gmMeasures.ts';
import { parseGmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { RangeMarksShown } from '../../../../src/app/pixi/measure/measurements';

const HERO = { x: 105, y: 105, size: 1 };
const GOBLIN = { x: 385, y: 105, size: 1 };
const MOVE = { name: 'Move', label: 'Move · 30ft', reach: 6.000001, color: '#22c55e' };
const CLOSE = { name: 'Close', label: 'Close', reach: 3.499999, color: null };

const ringsOn = (tokenId: string | null, more: Partial<RangeMarksShown> = {}): RangeMarksShown => ({
  rings: { tokenIds: tokenId === null ? [] : [tokenId], at: tokenId === null ? { x: 5, y: 7 } : HERO, rings: [MOVE, CLOSE] }, check: null, loose: false, hidden: false, ...more,
});
const checkTo = (toId: string, more: Partial<RangeMarksShown> = {}): RangeMarksShown => ({
  rings: null, check: { tokenIds: ['hero', toId], from: HERO, to: GOBLIN, text: '20ft' }, loose: false, hidden: false, ...more,
});

/** Players who see the tokens in `seen`, a set a test changes in place. */
const players = (seen: Set<string>): PlayersView => ({ footprints: () => [], seen: () => (id) => seen.has(id) });

describe('the GM\'s range marks online', () => {
  it('tell the rings of Ranges around a token or a point, and the range check, as they stand', () => {
    const measures = new GmMeasures();
    const seen = new Set(['hero', 'goblin']);
    measures.follow({ live: null, kept: [], ranges: ringsOn('hero', { loose: true }) }, players(seen), 0);
    expect(measures.shown((id) => seen.has(id)).ranges).toEqual({
      rings: { at: HERO, rings: [{ reach: MOVE.reach, label: MOVE.label, color: MOVE.color }, { reach: CLOSE.reach, label: CLOSE.label }] },
      loose: true,
    });
    measures.follow({ live: null, kept: [], ranges: ringsOn(null) }, players(new Set()), 0);
    expect(measures.shown(() => false).ranges?.rings?.at).toEqual({ x: 5, y: 7 });
    measures.follow({ live: null, kept: [], ranges: checkTo('goblin') }, players(seen), 0);
    expect(measures.shown((id) => seen.has(id)).ranges).toEqual({ check: { from: HERO, to: GOBLIN, text: '20ft' } });
    measures.follow({ live: null, kept: [], ranges: null }, players(seen), 0);
    expect(measures.shown(() => true)).not.toHaveProperty('ranges');
  });

  it('go with a token the players stop seeing, come back with it, and never show on one first shown unseen', () => {
    const measures = new GmMeasures();
    const seen = new Set(['hero']);
    const isSeen = (id: string): boolean => seen.has(id);
    measures.follow({ live: null, kept: [], ranges: ringsOn('hero') }, players(seen), 0);
    expect(measures.shown(isSeen).ranges?.rings).toBeDefined();
    seen.delete('hero');
    expect(measures.shown(isSeen)).not.toHaveProperty('ranges');
    seen.add('hero');
    expect(measures.shown(isSeen).ranges?.rings).toBeDefined();
    // A check to a goblin the players do not see stays out, also once they see it.
    measures.follow({ live: null, kept: [], ranges: checkTo('goblin') }, players(seen), 0);
    expect(measures.shown(isSeen)).not.toHaveProperty('ranges');
    seen.add('goblin');
    measures.follow({ live: null, kept: [], ranges: checkTo('goblin') }, players(seen), 0);
    expect(measures.shown(isSeen)).not.toHaveProperty('ranges');
  });

  it('tell nothing while the GM measures for themselves', () => {
    const measures = new GmMeasures();
    measures.follow({ live: null, kept: [], ranges: ringsOn(null, { hidden: true }) }, players(new Set()), 0);
    expect(measures.shown(() => true)).not.toHaveProperty('ranges');
  });

  it('read back as sent', () => {
    const measures = new GmMeasures();
    measures.follow({ live: null, kept: [], ranges: { ...ringsOn('hero'), check: checkTo('hero').check } }, players(new Set(['hero'])), 0);
    const marks = { t: 'marks', scene: 's1', lasers: [], measures: [{ who: 'gm', color: '#123456', ...measures.shown(() => true) }] };
    expect(parseGmMessage(JSON.parse(JSON.stringify(marks)))).toEqual(marks);
  });
});
