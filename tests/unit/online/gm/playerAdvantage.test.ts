import { parseGmMessage, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DiceSet, RollingDice } from '../../../../src/app/types/diceSetTypes';
import type { TokenEntity } from '../../../../src/app/types';
import { describe, expect, it } from 'vitest';
import { boundOwnership } from './fakeSeats.ts';
import { TOKEN_INTERVAL_MS, TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { DICE_TOOL, realDice, type DiceToolClass, type RealDice } from './realDice.ts';
import { sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const { DiceTool } = (await import(/* @vite-ignore */ DICE_TOOL)) as { DiceTool: DiceToolClass };

const ANA = 'a'.repeat(20);
const ART = new Map([['maps/cave.webp', new Uint8Array([1])], ['art/hero.webp', new Uint8Array([2])]]);
const GRID = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 } as const;
const HERO: TokenEntity = { ...token('hero', { x: 1, vision: { enabled: true } }), kind: 'character', name: 'Hero' };

/** A d20 that keeps the better of two with advantage and has no rule for disadvantage. */
const D20_ADVANTAGE: RollingDice = { dice: [{ count: 1, sides: 20 }], crit: 'natural', advantage: { kind: 'keep' } };
/** A character's own set: two d12, a d6 added with advantage and taken away with disadvantage. */
const HOPE: DiceSet = {
  id: 'hope', name: 'Hope and Fear', builtIn: false, crit: 'none',
  dice: [{ count: 1, sides: 12 }, { count: 1, sides: 12 }],
  advantage: { kind: 'die', sides: 6 }, disadvantage: { kind: 'die', sides: 6 },
};

type Table = ShareHarness & RealDice & { readonly scene: string; readonly hero: string };

/** A shared scene with a grid and Ana's hero, whose dice are Atlas's real tool rolling by `rules`; every die lands on its middle. */
async function table(rules: RollingDice): Promise<Table> {
  const owners = boundOwnership([{ id: ANA, name: 'Ana' }]);
  owners.welcome([{ id: ANA, name: 'Ana' }]);
  const state = sceneState({ grid: GRID, objects: { ...sceneState().objects, tokens: { hero: HERO } } });
  const share = shareHarness(state, ART, owners);
  owners.onChange(() => share.share.ownersChanged());
  const atlas = realDice(DiceTool, rules, () => 0.5);
  share.dice = atlas.dice;
  share.share.start();
  await share.set(state);
  await share.advance(TOKEN_INTERVAL_MS);
  owners.give(['hero'], {}, ANA);
  const list = tokenLists(share.sent).at(-1);
  return Object.assign(share, atlas, { scene: list?.scene ?? '', hero: list?.tokens[0]?.id ?? '' });
}

const last = <T extends GmMessage['t']>(sent: ShareHarness['sent'], t: T): Extract<GmMessage, { t: T }> | undefined =>
  sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : [])).at(-1);

describe('a player\'s roll with advantage', () => {
  it('is rolled as the map\'s dice set rules the side, in the open and in private', async () => {
    const gm = await table(D20_ADVANTAGE);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+3', token: gm.hero, advantage: 'advantage' });
    expect(gm.rolled[0]).toMatchObject({ formula: '1d20+3', advantage: 'advantage' });
    expect(gm.rolled[0]?.rolls.map((die) => [die.max, die.dropped === true])).toEqual([[20, false], [20, true]]);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d20+1', token: null, mode: 'gm', advantage: 'advantage' });
    expect(gm.logged.at(-1)?.roll.rolls).toHaveLength(2);
    expect(gm.errors).toEqual([]);
  });

  it('is rolled plain where the set has no rule for the side or the formula holds none of its dice', async () => {
    const gm = await table(D20_ADVANTAGE);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+3', token: gm.hero, advantage: 'disadvantage' });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '2d8+1', token: gm.hero, advantage: 'advantage' });
    await gm.advance(1000);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '2d8', token: null, mode: 'self', advantage: 'advantage' });
    expect(gm.rolled.map((roll) => [roll.rolls.length, roll.advantage])).toEqual([[1, undefined], [2, undefined]]);
    expect(gm.logged.at(-1)?.roll.rolls).toHaveLength(2);
    expect(gm.sent.some(({ body }) => body.t === 'roll-refused')).toBe(false);
    expect(gm.errors).toEqual([]);
  });

  it('is rolled plain where advantage would take the formula past the dice\'s limits', async () => {
    const gm = await table(D20_ADVANTAGE);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '100d20', token: null, advantage: 'advantage' });
    expect(gm.rolled.map((roll) => [roll.rolls.length, roll.advantage])).toEqual([[100, undefined]]);
    expect(gm.errors).toEqual([]);
  });

  it('follows the set of the character it is rolled for', async () => {
    const gm = await table(D20_ADVANTAGE);
    Object.assign(gm.dice, { setFor: (entry: TokenEntity) => (entry.id === 'hero' ? HOPE : undefined) });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+2', token: gm.hero, advantage: 'disadvantage' });
    expect(gm.rolled[0]).toMatchObject({ formula: '1d12+1d12+2', advantage: 'disadvantage' });
    expect(gm.rolled[0]?.rolls.map((die) => [die.max, die.negative === true])).toEqual([[12, false], [12, false], [6, true]]);
  });
});

describe('the dice pages offer advantage by', () => {
  it('are the map\'s in the scene\'s rules, and read back as sent', async () => {
    const gm = await table(D20_ADVANTAGE);
    const rules = last(gm.sent, 'rules');
    expect(rules?.dice).toEqual({ dice: [{ count: 1, sides: 20 }], sides: ['advantage'] });
    expect(parseGmMessage(JSON.parse(JSON.stringify(rules)))).toEqual(rules);
  });

  it('name a player\'s own token where its character rolls with a set of its own', async () => {
    const gm = await table({ dice: [{ count: 1, sides: 20 }], crit: 'natural' });
    expect(last(gm.sent, 'mine')).toEqual({ t: 'mine', scene: gm.scene, tokens: [gm.hero] });
    expect(last(gm.sent, 'rules')?.dice).toEqual({ dice: [{ count: 1, sides: 20 }], sides: [] });
    Object.assign(gm.dice, { setFor: () => HOPE });
    await gm.advance(TOKEN_POLL_MS);
    const mine = last(gm.sent, 'mine');
    expect(mine?.dice).toEqual({ [gm.hero]: { dice: [{ count: 1, sides: 12 }, { count: 1, sides: 12 }], sides: ['advantage', 'disadvantage'] } });
    expect(parseGmMessage(JSON.parse(JSON.stringify(mine)))).toEqual(mine);
  });
});
