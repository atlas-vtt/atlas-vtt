// @vitest-environment node
import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DiceRules } from '../../../../src/app/types/diceRulesTypes';
import type { TokenEntity } from '../../../../src/app/types';
import { describe, expect, it } from 'vitest';
import { Ownership, readOwnership } from '../../../../src/app/online/gm/ownership.ts';
import { playerFormula, rollableFormula } from '../../../../src/app/online/gm/PlayerRolls.ts';
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
async function table(rules: DiceRules, random: () => number): Promise<ShareHarness & RealDice & { readonly scene: string; readonly alias: (x: number) => string }> {
  const owners = new Ownership(readOwnership(undefined), () => undefined);
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

describe('a bonus from a player\'s sheet', () => {
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
});

describe('rollable formulas', () => {
  it('are those the tray writes, with dice', () => {
    expect(['1d20', '2d6 + 1d20 + 3', '1d6 - 2', '4d6!', 'd8'].every(rollableFormula)).toBe(true);
    expect(['+3', '0d6', '1d6+', 'x', '1d6'.repeat(30)].some(rollableFormula)).toBe(false);
  });

  it('take a signed bonus from a player, and no bare number', () => {
    expect(['+3', '-1', '+0', '1d20'].every(playerFormula)).toBe(true);
    expect(['3', '+12345', '+ 3', '+3+1', ''].some(playerFormula)).toBe(false);
  });
});
