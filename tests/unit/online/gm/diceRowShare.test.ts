import { parseGmMessage, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import type { CollectionLookup } from '../../../../src/app/gameSystems/mapRules';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import type { TokenEntity } from '../../../../src/app/types';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { boundOwnership } from './fakeSeats.ts';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { DICE_TOOL, realDice, type DiceToolClass } from './realDice.ts';
import { sceneState, shareHarness, token, tokenLists } from './shareHarness.ts';

const { DiceTool } = (await import(/* @vite-ignore */ DICE_TOOL)) as { DiceTool: DiceToolClass };

const ANA = 'a'.repeat(20);
const ART = new Map([['maps/cave.webp', new Uint8Array([1])], ['art/hero.webp', new Uint8Array([2])]]);
const HERO: TokenEntity = { ...token('hero', { x: 1, vision: { enabled: true } }), kind: 'character', name: 'Hero' };

const SMITE = { id: 'smite', name: 'Smite', formula: '+2', look: { dice: [{ count: 2, sides: 12, name: 'Hope', colour: '#e0b040' }], crit: 'natural' } };
const LONGSWORD = { id: 'longsword', name: 'Longsword', formula: '1d8+3[slashing]' };
const UNPINNED = { id: 'fireball', name: 'Fireball', formula: '', look: { dice: [{ count: 8, sides: 6 }], crit: 'natural' } };

/** A shared scene of a collection whose settings `settings` holds, with Ana's hero and Atlas's real dice. */
async function table(settings: { current: Partial<CollectionSettings> }) {
  const owners = boundOwnership([{ id: ANA, name: 'Ana' }]);
  owners.welcome([{ id: ANA, name: 'Ana' }]);
  const state = sceneState({ grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 }, objects: { ...sceneState().objects, tokens: { hero: HERO } } });
  const share = shareHarness(state, ART, owners);
  const collections: CollectionLookup = {
    getCollectionForMap: (mapPath) => (mapPath === state.mapPath ? 'Daggerheart' : null),
    getCollectionSettings: () => settings.current as CollectionSettings,
  };
  share.layers = fakeLayers({ state: () => state, source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, collections });
  const atlas = realDice(DiceTool, { defaultRoll: '1d20', crit: 'natural' }, () => 0.99);
  share.dice = atlas.dice;
  share.share.start();
  await share.set(state);
  await share.advance(TOKEN_INTERVAL_MS);
  owners.give(['hero'], {}, ANA);
  const scene = tokenLists(share.sent).at(-1)?.scene ?? '';
  return Object.assign(share, atlas, { scene });
}

const lastRules = (sent: readonly { readonly body: GmMessage }[]): Extract<GmMessage, { t: 'rules' }> | undefined =>
  sent.flatMap(({ body }) => (body.t === 'rules' ? [body] : [])).at(-1);

describe('the GM\'s dice row at an online table', () => {
  it('reaches players in the scene\'s rules, in the GM\'s order, and follows the GM\'s changes within the second', async () => {
    const settings = { current: { dicePresets: [SMITE, LONGSWORD, UNPINNED], diceRow: [{ kind: 'die', sides: 20 }, { kind: 'preset', id: 'smite' }, { kind: 'preset', id: 'longsword' }] } as Partial<CollectionSettings> };
    const gm = await table(settings);
    const rules = lastRules(gm.sent);
    expect(rules?.diceRow).toEqual([
      { die: 20 },
      { roll: { id: 'smite', name: 'Smite', formula: '+2', look: [{ count: 2, sides: 12, name: 'Hope', colour: '#e0b040' }] } },
      { roll: { id: 'longsword', name: 'Longsword', formula: '1d8+3[slashing]' } },
    ]);
    // A page reads it back whole.
    expect(parseGmMessage(JSON.parse(JSON.stringify(rules)))).toEqual(rules);

    // The GM pins another roll: the running table hears of it with the next look.
    settings.current = { ...settings.current, diceRow: [{ kind: 'preset', id: 'fireball' }, { kind: 'die', sides: 20 }] };
    await gm.advance(1000);
    expect(lastRules(gm.sent)?.diceRow).toEqual([{ roll: { id: 'fireball', name: 'Fireball', formula: '', look: [{ count: 8, sides: 6 }] } }, { die: 20 }]);

    // Back to the standard dice: the rules name no row.
    settings.current = { dicePresets: settings.current.dicePresets };
    await gm.advance(1000);
    expect(lastRules(gm.sent)).not.toHaveProperty('diceRow');
  });

  it('rolls a pinned designed roll with its own dice, names and colours, and refuses a roll that is not pinned', async () => {
    const gm = await table({ current: { dicePresets: [SMITE, LONGSWORD, UNPINNED], diceRow: [{ kind: 'preset', id: 'smite' }, { kind: 'preset', id: 'longsword' }] } });
    gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: 'whatever the page shows', token: null, preset: 'smite' });
    expect(gm.rolled).toHaveLength(1);
    const [roll] = gm.rolled;
    expect(roll?.formula).toBe('2d12+2');
    expect(roll?.rolls.map(({ max, name, colour }) => ({ max, name, colour }))).toEqual([
      { max: 12, name: 'Hope', colour: '#e0b040' }, { max: 12, name: 'Hope', colour: '#e0b040' },
    ]);
    expect(roll?.total).toBe(26);
    expect(roll?.diceSet?.name).toBe('Smite');

    // Neither a roll the GM did not pin nor a formula roll is rolled by its id (a formula roll goes as its formula).
    for (const preset of ['fireball', 'longsword', 'nothing']) {
      gm.share.receive(ANA, { t: 'roll', scene: gm.scene, formula: '1d6', token: null, preset });
      await gm.advance(1000);
    }
    expect(gm.rolled).toHaveLength(1);
    expect(gm.sent.filter(({ body }) => body.t === 'roll-refused').map(({ body, to }) => [body.t === 'roll-refused' && body.reason, to])).toEqual([
      ['formula', ANA], ['formula', ANA], ['formula', ANA],
    ]);
  });
});
