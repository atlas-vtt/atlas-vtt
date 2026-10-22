import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DiceSet, RollingDice } from '../../../../src/app/types/diceSetTypes';
import { parseSharedRoll } from '../../../../src/app/online/protocol/index.ts';
import type { DiceRules } from '../../../../src/app/types/diceRulesTypes';
import type { TokenEntity } from '../../../../src/app/types';
import { describe, expect, it } from 'vitest';
import { Ownership } from '../../../../src/app/online/gm/ownership.ts';
import { boundOwnership } from './fakeSeats.ts';
import { playerFormula, rollableFormula, rolledFormula } from '../../../../src/app/online/gm/PlayerRolls.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { DICE_TOOL, realDice, type DiceToolClass, type RealDice } from './realDice.ts';
import { sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const { DiceTool } = (await import(/* @vite-ignore */ DICE_TOOL)) as { DiceTool: DiceToolClass };

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const ART = new Map([['maps/cave.webp', new Uint8Array([1])], ['art/hero.webp', new Uint8Array([2])], ['art/ogre.webp', new Uint8Array([3])]]);
const TOKENS: TokenEntity[] = [
  { ...token('hero', { x: 1, vision: { enabled: true } }), kind: 'character', name: 'Hero' },
  { ...token('ogre', { x: 2 }), kind: 'character', name: 'Ogre' },
];

/** A shared scene with the hero (Ana's) and the ogre, whose dice are Atlas's real tool. */
async function table(rules: DiceRules | RollingDice, random: () => number): Promise<ShareHarness & RealDice & { readonly scene: string; readonly alias: (x: number) => string }> {
  const owners = boundOwnership([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
  owners.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
  const state = sceneState({ objects: { ...sceneState().objects, tokens: Object.fromEntries(TOKENS.map((entry) => [entry.id, entry])) } });
  const share = shareHarness(state, ART, owners);
  const atlas = realDice(DiceTool, rules, random);
  share.dice = atlas.dice;
  share.share.start();
  await share.set(state);
  await share.advance(TOKEN_INTERVAL_MS);
  owners.give(['hero'], {}, ANA);
  const list = tokenLists(share.sent).at(-1);
  return Object.assign(share, atlas, {
    scene: list?.scene ?? '',
    alias: (x: number) => list?.tokens.find((entry) => entry.x === x)?.id ?? '',
  });
}

const rollsSent = (sent: ShareHarness['sent']): Extract<GmMessage, { t: 'roll' }>[] => sent.flatMap(({ body }) => (body.t === 'roll' ? [body] : []));
const refusals = (sent: ShareHarness['sent']): { readonly reason: string; readonly to: string | undefined }[] => sent.flatMap(({ body, to }) => (body.t === 'roll-refused' ? [{ reason: body.reason, to }] : []));
/** A die face from a fraction: the d20 lands on `face`. */
const face = (value: number, sides: number): number => (value - 0.5) / sides;

describe('players\' rolls', () => {
  it('are rolled once each by Atlas\'s dice tool with the map\'s crit and explode rules, for the player\'s own token', async () => {
    // Every die shows its highest face once, then a 2: 1d20 crits and explodes once (2d6 explode too).
    const faces = [face(20, 20), face(2, 20), face(6, 6), face(2, 6), face(3, 6)];
    let next = 0;
    const gm = await table({ defaultRoll: '1d20', crit: 'natural', explode: { dice: 'all', repeats: true, highFaces: 1, lowFaces: 0 } }, () => faces[next++ % faces.length] ?? 0);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d20 + 5', token: gm.alias(1) });
    expect(gm.rolled).toHaveLength(1);
    const [roll] = gm.rolled;
    expect(roll?.crit).toBe('high');
    expect(roll?.rolls.map(({ value, exploded }) => [value, exploded === true])).toEqual([[20, false], [2, true]]);
    expect(roll?.total).toBe(27);
    expect(roll?.source).toEqual({ type: 'toolbar', tokenId: 'hero', tokenName: 'Hero' });

    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '2d6', token: null });
    expect(gm.rolled).toHaveLength(2);
    expect(gm.rolled[1]?.rolls.some((die) => die.exploded === true)).toBe(true);
    expect(gm.rolled[1]?.source).toEqual({ type: 'toolbar' });

    // Every roll reaches every player as Ana's, the first naming her hero by the id players know it by.
    const sent = rollsSent(gm.sent);
    expect(sent.map(({ who, token: named }) => [who, named])).toEqual([[ANA, gm.alias(1)], [ANA, null]]);
    expect(sent[0]?.result).toMatchObject({ total: 27, crit: 'high', formula: '1d20 + 5' });
    expect(gm.sent.filter(({ body }) => body.t === 'roll').every(({ to }) => to === undefined)).toBe(true);
    expect(JSON.stringify(sent)).not.toMatch(/hero|Hero|Player|art\//);
  });

  it('roll for nobody when the token is someone else\'s or unknown', async () => {
    const gm = await table({ defaultRoll: '1d20', crit: 'natural' }, () => 0.5);
    gm.share.receive(BEN, { t: 'roll', scene: gm.scene, formula: '1d8', token: gm.alias(1) });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d8', token: gm.alias(2) });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d8', token: 'f'.repeat(24) });
    expect(gm.rolled.map((roll) => roll.source)).toEqual([{ type: 'toolbar' }, { type: 'toolbar' }, { type: 'toolbar' }]);
    expect(rollsSent(gm.sent).map((roll) => roll.token)).toEqual([null, null, null]);
  });

  it('refuse a formula Atlas would complete or reject to the sender alone, with no roll and no notice', async () => {
    const gm = await table({ defaultRoll: '1d20', crit: 'natural' }, () => 0.5);
    for (const formula of ['3', '', '+ 3', '0d6', '1d6 +', 'd20 + abc', '2d6 ^ 2', '1d1001']) {
      gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula, token: null });
      await gm.advance(1000);
    }
    expect(gm.rolled).toEqual([]);
    expect(gm.errors).toEqual([]);
    expect(rollsSent(gm.sent)).toEqual([]);
    expect(refusals(gm.sent)).toEqual(Array.from({ length: 8 }, () => ({ reason: 'formula', to: ANA })));
  });

  it('refuse another scene and a GM tab without dice', async () => {
    const gm = await table({ defaultRoll: '1d20', crit: 'natural' }, () => 0.5);
    gm.share.receive(ANA, { t: 'roll', scene: 'old-scene', formula: '1d6', token: null });
    const harness: ShareHarness = gm;
    harness.dice = null;
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d6', token: null });
    expect(refusals(gm.sent)).toEqual([{ reason: 'scene', to: ANA }, { reason: 'unavailable', to: ANA }]);
    expect(gm.rolled).toEqual([]);
  });

  it('take a burst of three, then one a second, per player', async () => {
    const gm = await table({ defaultRoll: '1d20', crit: 'natural' }, () => 0.5);
    for (let i = 0; i < 5; i++) gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d6', token: null });
    gm.share.receive(BEN, { t: 'roll', scene: gm.scene, formula: '1d6', token: null });
    expect(gm.rolled).toHaveLength(4);
    expect(refusals(gm.sent)).toEqual([{ reason: 'rate', to: ANA }, { reason: 'rate', to: ANA }]);
    await gm.advance(1000);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d6', token: null });
    expect(gm.rolled).toHaveLength(5);
  });
});

describe('players\' private rolls and roll buttons', () => {
  it('a private roll is rolled quietly by the map\'s rules, logged for its audience and thrown only on the roller\'s page', async () => {
    const gm = await table({ defaultRoll: '1d20', crit: 'natural' }, () => 0.5);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d20 + 1', token: gm.alias(1), mode: 'gm', flavor: 'Insight' });
    expect(gm.rolled).toEqual([]);
    expect(gm.logged).toHaveLength(1);
    const [logged] = gm.logged;
    expect(logged).toMatchObject({ who: ANA, mode: 'gm', to: ['gm'], flavor: 'Insight', token: gm.alias(1), face: { name: 'Hero' } });
    expect(logged?.roll.rolls.map((die) => die.max)).toEqual([20]);
    expect(rollsSent(gm.sent).map((body) => body.result.id)).toEqual([logged?.roll.id]);
    expect(gm.sent.filter(({ body }) => body.t === 'roll').map(({ to }) => to)).toEqual([ANA]);
  });

  it('a blind roll is thrown on nobody\'s page', async () => {
    const gm = await table({ defaultRoll: '1d20', crit: 'natural' }, () => 0.5);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d20', token: null, mode: 'blind' });
    expect(gm.logged).toMatchObject([{ who: ANA, mode: 'blind', to: ['gm'] }]);
    expect(rollsSent(gm.sent)).toEqual([]);
  });

  it('a roll button is rolled as written, with its label, whatever the player sent', async () => {
    const gm = await table({ defaultRoll: '1d20', crit: 'natural' }, () => 0.5);
    const id = '0'.repeat(24);
    gm.requests = (from, answer) => (from === ANA && answer.index === 0 ? { formula: '1d4', mode: 'public', label: 'Luck' } : null);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d100', token: null, request: { id, index: 0 } });
    expect(gm.rolled.map((roll) => roll.formula)).toEqual(['1d4']);
    expect(gm.logged).toMatchObject([{ who: ANA, flavor: 'Luck', request: { id, label: 'Luck' } }]);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d100', token: null, request: { id, index: 1 } });
    expect(refusals(gm.sent)).toEqual([{ reason: 'formula', to: ANA }]);
  });
});

const HOPE_FEAR: RollingDice = { dice: [{ count: 1, sides: 12, name: 'Hope' }, { count: 1, sides: 12, name: 'Fear' }], crit: 'none' };

describe('a bonus from a player\'s sheet', () => {
  const campaign = { dice: [{ count: 1, sides: 10, name: 'Campaign', colour: '#8844cc' }], crit: 'natural' as const };
  const character: DiceSet = { id: 'personal', name: 'Personal dice', builtIn: false, dice: [
    { count: 1, sides: 12, name: 'Sun ☀', colour: '#ffaa00' },
    { count: 1, sides: 12, name: 'Moon', colour: '#3366ff' },
  ], crit: 'doubles' };

  it('uses the owned character default in public and private and carries its names and colours to players', async () => {
    const gm = await table(campaign, () => 0.5);
    Object.assign(gm.dice, { setFor: (token: TokenEntity) => token.id === 'hero' ? character : undefined });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+2', token: gm.alias(1) });
    expect(gm.rolled[0]?.formula).toBe('1d12+1d12+2');
    const want = character.dice.map(({ sides, name, colour }) => ({ max: sides, name, colour }));
    expect(gm.rolled[0]?.rolls).toMatchObject(want);
    expect(parseSharedRoll(rollsSent(gm.sent)[0]?.result)?.rolls).toMatchObject(want);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '-1', token: gm.alias(1), mode: 'gm' });
    expect(gm.logged.at(-1)?.roll.formula).toBe('1d12+1d12-1');
    expect(parseSharedRoll(gm.logged.at(-1)?.roll)?.rolls).toMatchObject(want);
  });

  it('rolls a sum of numbers as one bonus with the set\'s dice, in public and private', async () => {
    const gm = await table(campaign, () => 0.5);
    Object.assign(gm.dice, { setFor: () => character });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+4+1', token: gm.alias(1) });
    expect(gm.rolled[0]).toMatchObject({ formula: '1d12+1d12+4+1', modifiers: 5 });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '-1+2', token: gm.alias(1), mode: 'gm' });
    expect(gm.logged.at(-1)?.roll.formula).toBe('1d12+1d12-1+2');
    expect(refusals(gm.sent)).toEqual([]);
  });

  it('gives explicit sheet pools the owned character appearance in public and private', async () => {
    const gm = await table(campaign, () => 0.5);
    Object.assign(gm.dice, { setFor: () => character });
    const want = character.dice.map(({ sides, name, colour }) => ({ max: sides, name, colour }));
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: 'd12+d12+d6+2', token: gm.alias(1), setAppearance: true });
    expect(gm.rolled[0]?.formula).toBe('d12+d12+d6+2');
    expect(gm.rolled[0]?.rolls.slice(0, 2)).toMatchObject(want);
    expect(gm.rolled[0]?.rolls[2]).not.toHaveProperty('name');
    expect(parseSharedRoll(rollsSent(gm.sent)[0]?.result)?.rolls.slice(0, 2)).toMatchObject(want);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '2d12-1', token: gm.alias(1), mode: 'gm', setAppearance: true });
    expect(gm.logged.at(-1)?.roll.formula).toBe('2d12-1');
    expect(gm.logged.at(-1)?.roll.rolls).toMatchObject(want);
  });

  it('uses campaign appearance only for a matching pool, without borrowing another character’s set', async () => {
    const gm = await table(campaign, () => 0.5);
    Object.assign(gm.dice, { setFor: () => character });
    gm.share.receive(BEN, { t: 'roll', scene: gm.scene, formula: 'd12+d12', token: gm.alias(1), setAppearance: true });
    expect(gm.rolled[0]?.rolls.some((die) => die.name || die.colour)).toBe(false);
    gm.share.receive(BEN, { t: 'roll', scene: gm.scene, formula: 'd10+d8', token: null, setAppearance: true });
    expect(gm.rolled[1]?.rolls).toMatchObject([{ name: 'Campaign', colour: '#8844cc' }, { max: 8 }]);
    expect(gm.rolled[1]?.rolls[1]).not.toHaveProperty('colour');
  });

  it('inherits campaign defaults without a sheet override, and never borrows another player’s override', async () => {
    const gm = await table(campaign, () => 0.5);
    Object.assign(gm.dice, { setFor: () => character });
    gm.share.receive(BEN, { t: 'roll', scene: gm.scene, formula: '+2', token: gm.alias(1) });
    expect(gm.rolled[0]?.rolls).toMatchObject([{ max: 10, name: 'Campaign', colour: '#8844cc' }]);
    delete (gm.dice as { setFor?: unknown }).setFor;
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+2', token: gm.alias(1) });
    expect(gm.rolled[1]?.rolls).toMatchObject([{ max: 10, name: 'Campaign', colour: '#8844cc' }]);
  });

  it('keeps explicit dice ahead of character and campaign defaults in public and private', async () => {
    const gm = await table(campaign, () => 0.5);
    Object.assign(gm.dice, { setFor: () => character });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d8+2', token: gm.alias(1) });
    expect(gm.rolled[0]?.formula).toBe('1d8+2');
    expect(gm.rolled[0]?.rolls).toEqual([{ die: 'd8', max: 8, value: 5 }]);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d12+2', token: gm.alias(1), mode: 'gm' });
    expect(gm.logged.at(-1)?.roll.rolls).toMatchObject([{ die: 'd12', max: 12 }]);
    expect(gm.logged.at(-1)?.roll.rolls[0]).not.toHaveProperty('name');
    expect(gm.logged.at(-1)?.roll.rolls[0]).not.toHaveProperty('colour');
  });


  it('is completed with the map\'s dice, in the open and in private, as a bonus clicked on a statblock is', async () => {
    const gm = await table({ defaultRoll: '2d12', crit: 'natural' }, () => 0.5);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+2', token: gm.alias(1), flavor: 'Agility' });
    expect(gm.rolled.map((roll) => roll.formula)).toEqual(['2d12+2']);
    expect(gm.rolled[0]?.rolls.map((die) => die.max)).toEqual([12, 12]);
    expect(rollsSent(gm.sent)[0]).toMatchObject({ who: ANA, token: gm.alias(1), result: { formula: '2d12+2' } });

    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '-1', token: null, mode: 'gm' });
    expect(gm.logged.at(-1)).toMatchObject({ who: ANA, mode: 'gm', roll: { formula: '2d12-1' } });
    expect(gm.logged.at(-1)?.roll.rolls.map((die) => die.max)).toEqual([12, 12]);
    expect(refusals(gm.sent)).toEqual([]);
    expect(gm.errors).toEqual([]);
  });

  it('keeps the names of its numbers, a bonus filling a formula\'s length with them too', async () => {
    const gm = await table({ defaultRoll: '2d12', crit: 'natural' }, () => 0.5);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+4+3[Str mod]', token: gm.alias(1) });
    expect(gm.rolled[0]).toMatchObject({ formula: '2d12+4+3[Str mod]', modifiers: 7, namedModifiers: [{ label: 'Str mod', value: 3 }] });
    expect(parseSharedRoll(rollsSent(gm.sent)[0]?.result)?.namedModifiers).toEqual([{ label: 'Str mod', value: 3 }]);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d6-1[Bane]', token: gm.alias(1), mode: 'gm' });
    expect(parseSharedRoll(gm.logged.at(-1)?.roll)?.namedModifiers).toEqual([{ label: 'Bane', value: -1 }]);
    const long = `+1[${'A'.repeat(24)}]`.repeat(3) + '+1'.repeat(7);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: long, token: gm.alias(1), mode: 'gm' });
    expect(gm.logged.at(-1)?.roll.formula).toBe(`2d12${long}`);
    expect(refusals(gm.sent)).toEqual([]);
    expect(gm.errors).toEqual([]);
  });

  it('rolls a bonus named by what it is for with the set\'s dice, the name a term of its own', async () => {
    const gm = await table(HOPE_FEAR, () => 0.5);
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '+4[Agility]', token: gm.alias(1), flavor: 'Agility' });
    expect(gm.rolled[0]).toMatchObject({ formula: '1d12+1d12+4[Agility]', modifiers: 4, namedModifiers: [{ label: 'Agility', value: 4 }] });
    expect(gm.rolled[0]?.rolls.map((die) => die.name)).toEqual(['Hope', 'Fear']);
    expect(parseSharedRoll(rollsSent(gm.sent)[0]?.result)?.namedModifiers).toEqual([{ label: 'Agility', value: 4 }]);
    expect(refusals(gm.sent)).toEqual([]);
  });
});

describe('a player\'s formula as it is rolled', () => {
  it('drops the names of its numbers only where a default roll too long to complete them leaves no room', () => {
    const long = `+1[${'A'.repeat(24)}]`.repeat(3);
    expect(rolledFormula(long, { defaultRoll: '2d12', crit: 'natural' })).toBe(long);
    // A hand-written default roll of 77 characters: completed, the named bonus would be 161.
    const crowded = { defaultRoll: Array.from({ length: 13 }, () => '1d999').join('+'), crit: 'natural' as const };
    expect(rolledFormula(long, crowded)).toBe('+1+1+1');
  });
});

describe('rollable formulas', () => {
  it('are those the tray writes, with dice', () => {
    expect(['1d20', '2d6 + 1d20 + 3', '1d6 - 2', '4d6!', 'd8'].every(rollableFormula)).toBe(true);
    expect(['+3', '0d6', '1d6+', 'x', '1d6'.repeat(30)].some(rollableFormula)).toBe(false);
  });

  it('take a signed bonus from a player, a sum of numbers too, and no bare number or unsigned sum', () => {
    expect(['+3', '-1', '+0', '1d20', '+3+1', '+4+1', '-1+2', '+2*3'].every(playerFormula)).toBe(true);
    expect(['3', '4+1', '+ 3', '+12345', '*2', '+3+', '', '1d0'].some(playerFormula)).toBe(false);
    expect(['+4+3[Str mod]', '-1[Bane]'].every(playerFormula)).toBe(true);
    expect(['+4 +3[Str mod]', '+3[Str mod] '].some(playerFormula)).toBe(false);
  });
});
