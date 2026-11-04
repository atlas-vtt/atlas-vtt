import { describe, expect, it } from 'vitest';
import { parseLogEntry } from '../../../../src/app/online/protocol/index.ts';
import { isOpen, readSavedLog, viewOf, type GmLogEntry } from '../../../../src/app/online/gm/log/logEntries.ts';

const MIRA = 'm'.repeat(20);
const TOM = 't'.repeat(20);

const REST: GmLogEntry = {
  id: 'e'.repeat(24), at: 1_000, who: 'gm', name: 'GM', kind: 'rest', character: 'Brannoch', button: 'Long rest',
  changes: [{ label: 'Hit Points', from: 4, to: 18, roll: '2d8+2 = 14' }], skipped: ['Exhaustion'], restPlayers: [MIRA],
};

describe('a rest in the log', () => {
  it('reads whole to the GM and the character\'s player, and as its title to everyone else', () => {
    const { restPlayers: _players, ...shared } = REST;
    expect(viewOf(REST, 'gm')).toEqual(shared);
    expect(viewOf(REST, MIRA)).toEqual(shared);
    const { changes: _changes, skipped: _skipped, ...title } = shared;
    expect(viewOf(REST, TOM)).toEqual(title);
    expect(parseLogEntry(viewOf(REST, TOM))).toEqual(title);
    // Each is sent their own view, never one for all.
    expect(isOpen(REST)).toBe(false);
  });

  it('is its title to every player where nobody plays its character any more', () => {
    const { restPlayers: _players, ...orphan } = REST;
    expect(viewOf(orphan, MIRA)).not.toHaveProperty('changes');
  });

  it('keeps who sees what it changed with the saved log', () => {
    const { entries } = readSavedLog({ entries: [JSON.parse(JSON.stringify(REST)), { ...REST, id: 'f'.repeat(24), restPlayers: ['not a player', 7] }], present: [] });
    expect(entries[0]?.restPlayers).toEqual([MIRA]);
    expect(entries[1]).not.toHaveProperty('restPlayers');
  });
});

const ANNA = 'a'.repeat(20);

/** Brannoch rests and tends to Kestrel's wounds: Mira plays Brannoch, Anna plays Kestrel, Tom neither. */
const HELPED: GmLogEntry = {
  id: 'c'.repeat(24), at: 2_000, who: 'gm', name: 'GM', kind: 'rest', character: 'Brannoch', button: 'Short rest', picks: ['Tend to Wounds', 'Clear Stress'],
  changes: [{ label: 'Stress', from: 3, to: 2 }, { label: 'Hit Points', from: 2, to: 6, roll: '1d4+1 = 4', character: 'Kestrel' }],
  skipped: ['Hope'], restPlayers: [MIRA], changePlayers: [[], [ANNA]],
};

describe('a rest with actions picked for another character', () => {
  it('reads whole to the resting character\'s player, the changes to their own character to the other\'s, and its picks to everyone', () => {
    const { restPlayers: _players, changePlayers: _changePlayers, ...shared } = HELPED;
    expect(viewOf(HELPED, 'gm')).toEqual(shared);
    expect(viewOf(HELPED, MIRA)).toEqual(shared);
    const { changes: _changes, skipped: _skipped, ...title } = shared;
    // Without the roll, which carries the resting character's numbers
    expect(viewOf(HELPED, ANNA)).toEqual({ ...title, changes: [{ label: 'Hit Points', from: 2, to: 6, character: 'Kestrel' }] });
    expect(viewOf(HELPED, TOM)).toEqual(title);
    expect(viewOf(HELPED, TOM)).toMatchObject({ picks: ['Tend to Wounds', 'Clear Stress'] });
    for (const viewer of ['gm', MIRA, ANNA, TOM]) expect(parseLogEntry(JSON.parse(JSON.stringify(viewOf(HELPED, viewer))))).toEqual(viewOf(HELPED, viewer));
  });

  it('keeps whose each change is with the saved log, and none that does not fit its changes', () => {
    const { entries } = readSavedLog({ entries: [JSON.parse(JSON.stringify(HELPED)), { ...HELPED, id: 'd'.repeat(24), changePlayers: [[ANNA]] }], present: [] });
    expect(entries[0]?.changePlayers).toEqual([[], [ANNA]]);
    expect(entries[1]).not.toHaveProperty('changePlayers');
    expect(viewOf(entries[1]!, ANNA)).not.toHaveProperty('changes');
  });

  it('reads an entry of an older GM, without picks or named changes, as before', () => {
    const { picks: _picks, changePlayers: _changePlayers, restPlayers: _players, ...older } = HELPED;
    const read = parseLogEntry({ ...older, changes: [{ label: 'Stress', from: 3, to: 2 }] });
    expect(read).not.toHaveProperty('picks');
    expect(parseLogEntry({ ...older, picks: ['ok', 7] })).toBeNull();
  });
});
