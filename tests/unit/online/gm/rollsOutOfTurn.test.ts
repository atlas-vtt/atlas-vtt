import type { GmMessage, PlayerRoll } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../../../src/app/types/initiativeTypes';
import { boundOwnership } from './fakeSeats.ts';
import { DICE_TOOL, realDice, type DiceToolClass, type RealDice } from './realDice.ts';
import { sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const { DiceTool } = (await import(/* @vite-ignore */ DICE_TOOL)) as { DiceTool: DiceToolClass };

const ANA = 'a'.repeat(20);
/** A PNG's signature and header for a 1000 × 800 image: all `imageDimensions` reads. */
const PNG_1000x800 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0xe8, 0, 0, 0x03, 0x20, 8, 6]);
const BUTTON = '0'.repeat(24);

const entry = (tokenId: string, order: number, changes: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 10, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...changes,
});
const fight = (hero: Partial<InitiativeEntry>, changes: Partial<InitiativeState> = {}): InitiativeState => ({
  ...createDefaultInitiativeState(), isActive: true, round: 1, entries: [entry('ogre', 0, { isActive: true }), entry('hero', 1, hero)], ...changes,
});

/** Fights in which the hero (Ana's) does not hold the turn, each way a fight can say so. */
const FIGHTS: Readonly<Record<string, InitiativeState>> = {
  'in turn order, on the ogre\'s turn': fight({}),
  'by sides, on the opponents\' turn': fight({}, { sides: { first: 'opponents', active: 'opponents' } }),
  'by sides, sitting the round out': fight({ sitsOut: true }, { sides: { first: 'players', active: 'players' } }),
};

type Table = ShareHarness & RealDice & { readonly scene: string; readonly hero: string; readonly held: boolean };

/** A shared fight where the GM lets players move only on their turn, with Atlas's real dice. */
async function table(initiative: InitiativeState): Promise<Table> {
  const tokens = { hero: { ...token('hero', { x: 105, vision: { enabled: true } }), name: 'Hero' }, ogre: token('ogre', { x: 315 }) };
  const state = { ...sceneState({ background: 'maps/cave.png', objects: { ...sceneState().objects, tokens } }), initiative, initiativeTrackerOpen: true } as SceneState;
  const owners = boundOwnership([{ id: ANA, name: 'Ana' }]);
  owners.welcome([{ id: ANA, name: 'Ana' }]);
  owners.give(['hero'], {}, ANA);
  const share = shareHarness(state, new Map([['maps/cave.png', PNG_1000x800]]), owners);
  const atlas = realDice(DiceTool, { defaultRoll: '1d20', crit: 'natural' }, () => 0.5);
  share.settings = { ...share.settings, movesOnTurn: true, showInitiative: true };
  share.dice = atlas.dice;
  share.requests = (from, answer) => (from === ANA && answer.id === BUTTON && answer.index === 0 ? { formula: '1d20+3', mode: 'public', label: 'Dexterity save' } : null);
  share.share.start();
  await share.set(state);
  await share.advance(TOKEN_INTERVAL_MS);
  const list = tokenLists(share.sent).at(-1);
  const hero = list?.tokens.find((shared) => shared.x === 105);
  return Object.assign(share, atlas, { scene: list?.scene ?? '', hero: hero?.id ?? '', held: hero?.held === true });
}

const sentOf = <K extends GmMessage['t']>(sent: ShareHarness['sent'], t: K): Extract<GmMessage, { t: K }>[] =>
  sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: K }>] : []));

describe.each(Object.entries(FIGHTS))('a player whose token waits for its turn, %s', (_name, initiative) => {
  it('rolls from the tray, the sheet, an ability and a roll button, in the open and in private, while a move waits', async () => {
    const gm = await table(initiative);
    // The move rule is in force for the hero: this is the state in which rolls must still go through
    expect(gm.held).toBe(true);
    const rolls: Omit<PlayerRoll, 't' | 'scene'>[] = [
      { formula: '1d20', token: gm.hero },
      { formula: '+2', token: gm.hero, flavor: 'Dexterity save' },
      { formula: '2d6+3', token: gm.hero, flavor: 'Fire Bolt' },
      { formula: '1d100', token: gm.hero, request: { id: BUTTON, index: 0 } },
      { formula: '1d20+1', token: gm.hero, mode: 'gm', flavor: 'Insight' },
    ];
    for (const roll of rolls) {
      await gm.advance(1000);
      gm.share.receive(ANA, { t: 'roll', scene: gm.scene, ...roll });
    }
    expect(sentOf(gm.sent, 'roll-refused')).toEqual([]);
    expect(gm.errors).toEqual([]);
    // The open rolls are thrown by the GM's dice and shown to the table as Ana's, for her hero
    expect(gm.rolled.map((roll) => roll.formula)).toEqual(['1d20', '1d20+2', '2d6+3', '1d20+3']);
    expect(sentOf(gm.sent, 'roll').map(({ who, token: named }) => [who, named])).toEqual(Array.from({ length: 5 }, () => [ANA, gm.hero]));
    expect(gm.logged.map(({ who, flavor, mode }) => [who, flavor, mode])).toEqual([
      [ANA, undefined, undefined], [ANA, 'Dexterity save', undefined], [ANA, 'Fire Bolt', undefined], [ANA, 'Dexterity save', undefined], [ANA, 'Insight', 'gm'],
    ]);

    // The same player's move is still the turn's to decide
    gm.share.receive(ANA, { t: 'move', scene: gm.scene, id: gm.hero, x: 500, y: 300 });
    expect(sentOf(gm.sent, 'move-refused').map(({ reason }) => reason)).toEqual(['turn']);
    expect(gm.state().objects.tokens.hero).toMatchObject({ x: 105 });
  });
});
