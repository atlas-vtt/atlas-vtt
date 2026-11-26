import { describe, expect, it } from 'vitest';
import { parseLogEntry, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { isOpen, readSavedLog, viewOf, type GmLogEntry } from '../../../../src/app/online/gm/log/logEntries.ts';
import { publishEntry } from '../../../../src/app/online/gm/log/logFanout.ts';
import { rollEntry } from '../../../../src/app/online/gm/log/logTypes.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const GOBLIN = '0'.repeat(24);

/** The GM's roll for the goblin's Bite, which only Ben's picture shows. */
const BITE: GmLogEntry = rollEntry({ id: 'e'.repeat(24), at: 1_000, who: 'gm', name: 'GM' }, {
  who: 'gm', token: GOBLIN, namedFor: [BEN], shared: true, face: { name: 'Goblin', image: null },
  roll: { id: 'roll_1', timestamp: 1, formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 0, total: 13, crit: null, source: { type: 'statblock', abilityName: 'Bite' } },
});

describe('a roll in the log whose token only some players see', () => {
  it('names its token and what it was for only to those players, and whole to the GM', () => {
    expect(viewOf(BITE, BEN)).toMatchObject({ token: GOBLIN, roll: { source: { type: 'statblock', abilityName: 'Bite' } } });
    const ana = viewOf(BITE, ANA);
    expect(ana).toMatchObject({ token: null, roll: { source: { type: 'statblock' } } });
    expect(JSON.stringify(ana)).not.toMatch(/Bite|Goblin|0{24}/);
    expect(parseLogEntry(ana)).toEqual(ana);
    expect(viewOf(BITE, 'gm')).toMatchObject({ token: GOBLIN });
    expect(viewOf(BITE, BEN)).not.toHaveProperty('namedFor');
  });

  it('goes to each player as they may see it, never once to all', () => {
    const sent: { readonly body: GmMessage; readonly to: string | undefined }[] = [];
    expect(isOpen(BITE)).toBe(false);
    publishEntry((body, to) => void sent.push({ body, to }), [ANA, BEN], BITE);
    expect(sent.map(({ body, to }) => [to, body.t === 'log-entry' && body.entry.kind === 'roll' ? body.entry.token : undefined])).toEqual([[ANA, null], [BEN, GOBLIN]]);
  });

  it('keeps who it is named to with the saved log, and names it to nobody where none of them reads', () => {
    const { entries } = readSavedLog({ entries: [JSON.parse(JSON.stringify(BITE)), { ...BITE, id: 'f'.repeat(24), namedFor: ['not a player'] }], present: [] });
    expect(entries[0]?.namedFor).toEqual([BEN]);
    expect(viewOf(entries[1]!, BEN)).toMatchObject({ token: null });
  });
});
