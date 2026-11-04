import { describe, expect, it } from 'vitest';
import { MAX_ROLLED_DICE, parseGmMessage, parsePlayerMessage, parseSharedRoll, type SharedRoll } from '../../../../src/app/online/protocol/index.ts';

const ALIAS = 'a1'.repeat(12);
const PLAYER = 'abcdefghijklmnopqrst';
const ROLL: SharedRoll = {
  id: 'roll_1', timestamp: 1_700_000_000_000, formula: '2d6 + 1', modifiers: 1, total: 9, crit: null,
  rolls: [{ die: 'd6', value: 6, max: 6 }, { die: 'd6', value: 2, max: 6, exploded: true }],
  source: { type: 'toolbar' },
};

describe('player rolls', () => {
  it('read a formula for a token or for nobody', () => {
    expect(parsePlayerMessage({ t: 'roll', scene: 's1', formula: '2d6 + 1', token: ALIAS })).toEqual({ t: 'roll', scene: 's1', formula: '2d6 + 1', token: ALIAS });
    expect(parsePlayerMessage({ t: 'roll', scene: 's1', formula: '1d20', token: null })).toEqual({ t: 'roll', scene: 's1', formula: '1d20', token: null });
  });

  it('carry a roll mode, a flavor and the roll button they answer; public is the absence of a mode', () => {
    const request = { id: '0'.repeat(24), index: 2 };
    expect(parsePlayerMessage({ t: 'roll', scene: 's1', formula: '1d20', token: null, mode: 'blind', flavor: '  Stealth ', request }))
      .toEqual({ t: 'roll', scene: 's1', formula: '1d20', token: null, mode: 'blind', flavor: 'Stealth', request });
    expect(parsePlayerMessage({ t: 'roll', scene: 's1', formula: '1d20', token: null, mode: 'public' })).toEqual({ t: 'roll', scene: 's1', formula: '1d20', token: null });
  });

  it('refuse long formulas, odd tokens and a missing scene', () => {
    for (const body of [
      { t: 'roll', scene: 's1', formula: `1d6${'+1'.repeat(50)}`, token: null },
      { t: 'roll', scene: 's1', formula: '1d6', token: null, mode: 'loud' },
      { t: 'roll', scene: 's1', formula: '1d6', token: null, request: { id: 'x', index: 0 } },
      { t: 'roll', scene: 's1', formula: '1d6', token: null, flavor: '\u202e' },
      { t: 'roll', scene: 's1', formula: 7, token: null },
      { t: 'roll', scene: 's1', formula: '1d6', token: 'gm-hero-id' },
      { t: 'roll', scene: 's1', formula: '1d6' },
      { t: 'roll', scene: '', formula: '1d6', token: null },
    ]) expect(parsePlayerMessage(body), JSON.stringify(body)).toBeNull();
  });
});

describe('shared rolls', () => {
  it('read a roll by a player or the GM, with or without a token', () => {
    expect(parseGmMessage({ t: 'roll', who: PLAYER, result: ROLL, token: ALIAS })).toEqual({ t: 'roll', who: PLAYER, result: ROLL, token: ALIAS });
    expect(parseGmMessage({ t: 'roll', who: 'gm', result: { ...ROLL, source: { type: 'statblock', abilityName: 'Bite' } }, token: null })).not.toBeNull();
    expect(parseGmMessage({ t: 'roll-refused', reason: 'rate' })).toEqual({ t: 'roll-refused', reason: 'rate' });
  });

  it('drop fields players are not meant to read', () => {
    const parsed = parseGmMessage({ t: 'roll', who: 'gm', result: { ...ROLL, player: 'Player', source: { type: 'toolbar', tokenId: 'gm-hero-id', tokenImagePath: 'art/hero.webp' } }, token: null });
    expect(parsed?.t === 'roll' ? parsed.result : null).toEqual({ ...ROLL, source: { type: 'toolbar' } });
  });

  it('refuse a die that cannot be, too many dice and odd totals before the dice see them', () => {
    const bad: unknown[] = [
      { ...ROLL, rolls: [{ die: 'd6', value: 7, max: 6 }] },
      { ...ROLL, rolls: [{ die: 'd20', value: 3, max: 6 }] },
      { ...ROLL, rolls: [{ die: 'd6', value: 0, max: 6 }] },
      { ...ROLL, rolls: [{ die: 'd1001', value: 1, max: 1001 }] },
      { ...ROLL, rolls: [{ die: 'd6', value: 2.5, max: 6 }] },
      { ...ROLL, rolls: [{ die: 'd6', value: 2, max: 6, negative: false }] },
      { ...ROLL, rolls: Array.from({ length: MAX_ROLLED_DICE + 1 }, () => ({ die: 'd6', value: 1, max: 6 })) },
      { ...ROLL, total: Number.NaN },
      { ...ROLL, total: Infinity },
      { ...ROLL, crit: 'maybe' },
      { ...ROLL, source: { type: 'macro' } },
      { ...ROLL, id: '' },
      { ...ROLL, rolls: 'd6' },
    ];
    for (const result of bad) expect(parseGmMessage({ t: 'roll', who: 'gm', result, token: null }), JSON.stringify(result).slice(0, 120)).toBeNull();
    expect(parseGmMessage({ t: 'roll', who: 'someone', result: ROLL, token: null })).toBeNull();
    expect(parseGmMessage({ t: 'roll-refused', reason: 'because' })).toBeNull();
  });
});

describe('shared dice of the full notation', () => {
  const roll = (rolls: unknown[], extra: Record<string, unknown> = {}): unknown => ({ id: 'r', timestamp: 1, formula: '4d6kh3', modifiers: 0, total: 3, rolls, ...extra });

  it('carry Fate dice, dropped, rerolled and counted dice, labels and a formula that is no plain sum', () => {
    const rolls = [
      { die: 'dF', value: -1, max: 1, min: -1 },
      { die: 'd6', value: 1, max: 6, rerolled: true },
      { die: 'd6', value: 5, max: 6, success: true, label: 'fire' },
      { die: 'd6', value: 2, max: 6, dropped: true, failure: true },
    ];
    expect(parseSharedRoll(roll(rolls, { linear: false }))).toEqual(roll(rolls, { linear: false }));
  });

  it('refuse a Fate die off its faces, a die below 1, an odd label or flag', () => {
    for (const die of [
      { die: 'dF', value: 2, max: 1, min: -1 },
      { die: 'dF', value: 0, max: 6, min: -1 },
      { die: 'd6', value: 0, max: 6 },
      { die: 'd6', value: 3, max: 6, min: -1 },
      { die: 'd6', value: 3, max: 6, label: '<b>' },
      { die: 'd6', value: 3, max: 6, dropped: 'yes' },
    ]) expect(parseSharedRoll(roll([die])), JSON.stringify(die)).toBeNull();
    expect(parseSharedRoll(roll([], { linear: true }))).toBeNull();
  });
});

describe('the named constants of a shared roll', () => {
  const named = { ...ROLL, formula: '1d20+4-1[Str mod]', modifiers: 3, total: 15, rolls: [{ die: 'd20', value: 12, max: 20 }] };

  it('are read in written order, a name the dice notation writes with a whole number each', () => {
    const terms = [{ label: 'Str mod', value: -1 }, { label: 'Proficiency', value: 2 }, { label: 'Proficiency', value: 2 }];
    expect(parseSharedRoll({ ...named, modifiers: 7, namedModifiers: terms })?.namedModifiers).toEqual(terms);
    expect(parseSharedRoll({ ...named, namedModifiers: [{ label: 'Str mod', value: -1, extra: true }] })?.namedModifiers).toEqual([{ label: 'Str mod', value: -1 }]);
    expect(parseSharedRoll(named)).not.toHaveProperty('namedModifiers');
  });

  it('are dropped, the roll kept, where they are malformed or cannot be part of its constants', () => {
    for (const namedModifiers of [
      'Str mod', [], [{ label: '', value: 1 }], [{ label: ' ', value: 1 }], [{ label: 'Str[mod]', value: 1 }], [{ label: 'A'.repeat(25), value: 1 }],
      [{ label: 'Str', value: 1.5 }], [{ label: 'Str', value: 2_000_000_000 }], [{ label: 'Str' }], [null],
      Array.from({ length: 21 }, () => ({ label: 'Str', value: 0 })),
      [{ label: 'A', value: -1_000_000_000 }, { label: 'B', value: -1_000_000_000 }],
    ]) {
      const read = parseSharedRoll({ ...named, namedModifiers });
      expect(read, JSON.stringify(namedModifiers)).toMatchObject({ formula: named.formula, total: 15 });
      expect(read, JSON.stringify(namedModifiers)).not.toHaveProperty('namedModifiers');
    }
    expect(parseSharedRoll({ ...named, linear: false, modifiers: 0, namedModifiers: [{ label: 'Str', value: 3 }] })).not.toHaveProperty('namedModifiers');
  });
});

describe('advantage', () => {
  const roll = { t: 'roll', scene: 's1', formula: '+3', token: null };
  const d20 = { dice: [{ count: 1, sides: 20 }], sides: ['advantage', 'disadvantage'] };

  it('is asked for with a side the GM rolls by; a side it does not know leaves the roll plain', () => {
    expect(parsePlayerMessage({ ...roll, advantage: 'disadvantage' })).toEqual({ ...roll, advantage: 'disadvantage' });
    for (const advantage of ['heroic', 1, null, ['advantage']]) expect(parsePlayerMessage({ ...roll, advantage }), String(advantage)).toEqual(roll);
  });

  it('is offered by the dice the rules and a player\'s tokens name; malformed dice are left out, the message kept', () => {
    const rules = { t: 'rules', scene: 's1', grid: { type: 'square', size: 70, offsetX: 0, offsetY: 0 }, snap: true, accent: null,
      measurement: { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 53 } };
    expect(parseGmMessage({ ...rules, dice: d20 })).toEqual({ ...rules, dice: d20 });
    expect(parseGmMessage({ ...rules, dice: { ...d20, sides: ['heroic', 'advantage'] } })).toEqual({ ...rules, dice: { ...d20, sides: ['advantage'] } });
    for (const dice of [{ dice: [{ count: 0, sides: 20 }], sides: [] }, { dice: [{ count: 1, sides: 1001 }], sides: [] }, { dice: [], sides: 'advantage' }, 'd20']) {
      expect(parseGmMessage({ ...rules, dice }), JSON.stringify(dice)).toEqual(rules);
    }
    const mine = { t: 'mine', scene: 's1', tokens: [ALIAS] };
    expect(parseGmMessage({ ...mine, dice: { [ALIAS]: d20 } })).toEqual({ ...mine, dice: { [ALIAS]: d20 } });
    expect(parseGmMessage({ ...mine, dice: { ['f'.repeat(24)]: d20, [ALIAS]: 'd20' } })).toEqual(mine);
  });
});
