import { describe, expect, it } from 'vitest';
import { MAX_MARK_RANGE_RINGS, MAX_RANGE_TEXT, parseGmMessage, parsePlayerMessage } from '../../../../src/app/online/protocol/index.ts';

const older = { color: '#66ffa9', live: null, kept: [] };
const marks = (state: object): object => ({ t: 'marks', scene: 's1', lasers: [], measures: [{ who: 'gm', ...older, ...state }] });
const RINGS = { at: { x: 105, y: 105, size: 1 }, rings: [{ reach: 6.000001, label: 'Move · 30ft', color: '#22c55e' }, { reach: 3.5, label: 'Close' }] };
const CHECK = { from: { x: 105, y: 105, size: 1 }, to: { x: 385, y: 105, size: 2 }, text: '20ft' };

describe('the GM\'s range marks', () => {
  it('are read beside the GM\'s measurements: rings around a token or a point, and the check', () => {
    const ranges = { rings: RINGS, check: CHECK, loose: true };
    expect(parseGmMessage(marks({ ranges }))).toEqual(marks({ ranges }));
    const point = { rings: { ...RINGS, at: { x: 5, y: 7 } } };
    expect(parseGmMessage(marks({ ranges: point }))).toEqual(marks({ ranges: point }));
  });

  it('are left out where malformed, and the measurements beside them still read', () => {
    const malformed = [
      { rings: { ...RINGS, rings: [] } },
      { rings: { ...RINGS, rings: Array.from({ length: MAX_MARK_RANGE_RINGS + 1 }, () => RINGS.rings[1]) } },
      { rings: { ...RINGS, rings: [{ reach: -1, label: 'Close' }] } },
      { rings: { ...RINGS, rings: [{ reach: 2, label: 'x'.repeat(MAX_RANGE_TEXT + 1) }] } },
      { rings: { ...RINGS, rings: [{ reach: 2, label: 'Close', color: 'red' }] } },
      { rings: { ...RINGS, at: { x: 'far', y: 0 } } },
      { check: { ...CHECK, to: { x: 0, y: 0, size: 0 } } },
      { check: { ...CHECK, text: 7 } },
      'rings',
    ];
    for (const ranges of malformed) expect(parseGmMessage(marks({ ranges })), JSON.stringify(ranges)).toEqual(marks({}));
    // One mark that reads stays where the other does not.
    expect(parseGmMessage(marks({ ranges: { rings: { ...RINGS, rings: [] }, check: CHECK } }))).toEqual(marks({ ranges: { check: CHECK } }));
  });

  it('keep only what the protocol names', () => {
    const ranges = { rings: { ...RINGS, more: 1 }, check: { ...CHECK, tokens: ['goblin'] }, loose: 'yes', hidden: true };
    expect(parseGmMessage(marks({ ranges }))).toEqual(marks({ ranges: { rings: RINGS, check: CHECK } }));
  });

  it('are no part of what a player tells', () => {
    const message = { t: 'measure', scene: 's1', ...older };
    expect(parsePlayerMessage({ ...message, ranges: { check: CHECK } })).toEqual(message);
    const player = { who: 'a'.repeat(20), ...older };
    const sent = { t: 'marks', scene: 's1', lasers: [], measures: [{ ...player, ranges: { check: CHECK } }] };
    expect(parseGmMessage(sent)).toEqual({ ...sent, measures: [player] });
  });
});
