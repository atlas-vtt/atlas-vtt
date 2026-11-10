import { EventEmitter } from 'node:events';
import { DEFAULT_DICE_RULES } from '../../../../src/app/gameSystems/diceRules';
import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DiceRollOrigin } from '../../../../src/app/types/diceRollOrigin';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import type { TokenEntity } from '../../../../src/app/types';
import { describe, expect, it } from 'vitest';
import type { DiceSource } from '../../../../src/app/online/gm/atlasDice.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const VIEW = 'view-1';
const ART = new Map([['maps/cave.webp', new Uint8Array([1])], ['art/hero.webp', new Uint8Array([2])], ['art/spy.webp', new Uint8Array([3])]]);
const TOKENS: TokenEntity[] = [
  { ...token('hero', { x: 1 }), kind: 'character', name: 'Hero' },
  { ...token('spy', { x: 2, isHidden: true }), kind: 'character', name: 'Spy' },
];

/** A GM roll from a statblock: Atlas's result as its bus announces it, with the GM's own fields. */
const gmRoll = (tokenId: string): DiceRollResult => ({
  id: 'roll_1', timestamp: 1, formula: '1d20 + 4', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 4, total: 17, crit: null, player: 'Player',
  source: { type: 'statblock', tokenId, statblockPath: `Bestiary/${tokenId}.md`, tokenName: tokenId, tokenImagePath: `art/${tokenId}.webp`, abilityName: 'Sneak Attack' },
});

async function table(showDiceRolls: boolean): Promise<ShareHarness & { readonly bus: EventEmitter; readonly heroAlias: string }> {
  const state = sceneState({ objects: { ...sceneState().objects, tokens: Object.fromEntries(TOKENS.map((entry) => [entry.id, entry])) } });
  const share = shareHarness(state, ART);
  const bus = new EventEmitter();
  const dice: DiceSource = { viewId: VIEW, rollDice: () => null, rules: () => DEFAULT_DICE_RULES, on: (event, listener) => bus.on(event, listener), off: (event, listener) => bus.off(event, listener) };
  share.dice = dice;
  share.settings = { ...share.settings, showDiceRolls };
  share.share.start();
  await share.set(state);
  await share.advance(TOKEN_INTERVAL_MS);
  return Object.assign(share, { bus, heroAlias: tokenLists(share.sent).at(-1)?.tokens.find((entry) => entry.x === 1)?.id ?? '' });
}

const origin = (tokenId: string, viewId = VIEW): DiceRollOrigin => ({ viewId, mapPath: sceneState().mapPath ?? '', tokenId });
const rollsSent = (sent: ShareHarness['sent']): Extract<GmMessage, { t: 'roll' }>[] => sent.flatMap(({ body }) => (body.t === 'roll' ? [body] : []));

describe('the GM\'s rolls', () => {
  it('are withheld while the player view does not show dice rolls', async () => {
    const gm = await table(false);
    gm.bus.emit('dice-rolled', gmRoll('hero'), origin('hero'));
    expect(rollsSent(gm.sent)).toEqual([]);
  });

  it('go to everyone while it does, naming a token players see by its alias with the ability rolled', async () => {
    const gm = await table(true);
    gm.bus.emit('dice-rolled', gmRoll('hero'), origin('hero'));
    expect(rollsSent(gm.sent)).toEqual([{
      t: 'roll', who: 'gm', token: gm.heroAlias,
      result: { id: 'roll_1', timestamp: 1, formula: '1d20 + 4', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 4, total: 17, crit: null, source: { type: 'statblock', abilityName: 'Sneak Attack' } },
    }]);
  });

  it('name the constants the roll names, so players see each as its own term', async () => {
    const gm = await table(true);
    const named: DiceRollResult = { ...gmRoll('hero'), formula: '1d20+4-1[Str mod]', modifiers: 3, total: 16, namedModifiers: [{ label: 'Str mod', value: -1 }] };
    gm.bus.emit('dice-rolled', named, origin('hero'));
    expect(rollsSent(gm.sent)[0]?.result).toMatchObject({ formula: '1d20+4-1[Str mod]', modifiers: 3, namedModifiers: [{ label: 'Str mod', value: -1 }] });
    gm.bus.emit('dice-rolled', gmRoll('hero'), origin('hero'));
    expect(rollsSent(gm.sent)[1]?.result).not.toHaveProperty('namedModifiers');
  });

  it('never name a hidden token, nor what it rolled, nor a token of another view', async () => {
    const gm = await table(true);
    gm.bus.emit('dice-rolled', gmRoll('spy'), origin('spy'));
    gm.bus.emit('dice-rolled', gmRoll('hero'), origin('hero', 'view-2'));
    gm.bus.emit('dice-rolled', gmRoll('hero'));
    const sent = rollsSent(gm.sent);
    expect(sent.map((roll) => [roll.token, roll.result.source])).toEqual([[null, { type: 'statblock' }], [null, { type: 'statblock' }], [null, { type: 'statblock' }]]);
    expect(JSON.stringify(sent)).not.toMatch(/spy|Spy|Sneak|Bestiary|art\/|Player/);
  });

  it('stop with the share', async () => {
    const gm = await table(true);
    gm.share.stop();
    gm.bus.emit('dice-rolled', gmRoll('hero'), origin('hero'));
    expect(rollsSent(gm.sent)).toEqual([]);
    expect(gm.bus.listenerCount('dice-rolled')).toBe(0);
  });
});
