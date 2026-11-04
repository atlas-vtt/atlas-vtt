import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { movesOutOfTurn, sharedTurnTokens, type TurnShareState } from '../../../../src/app/online/gm/turnShare.ts';
import { checkMove } from '../../../../src/app/online/gm/moveCheck.ts';
import { parseInitiative } from '../../../../src/app/online/protocol/initiative.ts';
import { sharedInitiative } from '../../../../src/app/online/gm/initiativeInputs.ts';
import { parseTokens } from '../../../../src/app/online/protocol/tokens.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { boundOwnership } from './fakeSeats.ts';
import { sceneState, shareHarness, token, tokenLists } from './shareHarness.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../../../src/app/types/initiativeTypes';

const ANA = 'a'.repeat(20);
/** A PNG's signature and header for a 1000 × 800 image: all `imageDimensions` reads. */
const PNG_1000x800 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0xe8, 0, 0, 0x03, 0x20, 8, 6]);
const entry = (tokenId: string, order: number, changes: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 10, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...changes,
});
const fight = (active: string, changes: Partial<InitiativeState> = {}): InitiativeState => ({
  ...createDefaultInitiativeState(), isActive: true, round: 1,
  entries: [entry('hero', 0, { isActive: active === 'hero' }), entry('ogre', 1, { isActive: active === 'ogre' })], ...changes,
});
const tokens = { hero: token('hero', { vision: { enabled: true } } as never), ogre: token('ogre'), cart: token('cart') };
/** The GM keeps moves to the turn, and players are shown the list. */
const ON = { movesOnTurn: true, showInitiative: true };
const state = (initiative: InitiativeState | undefined, open = true): TurnShareState => ({ initiative, initiativeTrackerOpen: open, objects: { tokens } });

describe('the turn players are told of', () => {
  it('is the turn holder, by sides every combatant of the side with the turn, and nothing while their list is not shown', () => {
    expect([...sharedTurnTokens(state(fight('ogre')), true)]).toEqual(['ogre']);
    expect([...sharedTurnTokens(state(fight('ogre', { sides: { first: 'players', active: 'players' } })), true)]).toEqual(['hero']);
    expect(sharedTurnTokens(state(fight('ogre')), false).size).toBe(0);
    expect(sharedTurnTokens(state(fight('ogre'), false), true).size).toBe(0);
    expect(sharedTurnTokens(state({ ...fight('ogre'), isActive: false }), true).size).toBe(0);
  });

  it('leaves out, by sides, a combatant its resources call defeated: no marker, and no move on its side\'s turn', () => {
    const hp = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: false } as never;
    const fallen = { ...tokens, ogre: token('ogre', { resources: { hp: { current: 0, max: 7 } } } as never) };
    const sides = { initiative: fight('none', { sides: { first: 'opponents', active: 'opponents' } }), initiativeTrackerOpen: true, objects: { tokens: fallen } };
    expect([...sharedTurnTokens(sides, true)]).toEqual(['ogre']);
    expect(sharedTurnTokens(sides, true, [hp]).size).toBe(0);
    expect(movesOutOfTurn(sides, ON, 'ogre')).toBe(false);
    expect(movesOutOfTurn(sides, { ...ON, definitions: [hp] }, 'ogre')).toBe(true);
  });

  it('tells the page when the GM switched the banner off or keeps moves to the turn, and nothing otherwise', () => {
    const inputs = { state: { initiative: fight('ogre'), initiativeTrackerOpen: true, mapPath: null, objects: { tokens } }, shown: true, showNames: false, rules: null, art: () => null };
    expect(sharedInitiative({ ...inputs, bannerOff: true, movesOnTurn: true })).toMatchObject({ bannerOff: true, movesOnTurn: true });
    const plain = sharedInitiative(inputs);
    expect(plain).not.toHaveProperty('bannerOff');
    expect(plain).not.toHaveProperty('movesOnTurn');
  });

  it('reads the new flags back, and anything but true as unset', () => {
    const initiative = { isActive: true, round: 1, bySides: false, firstSide: 'players', activeSide: null, combatants: [], bannerOff: true, movesOnTurn: true };
    expect(parseInitiative(initiative)).toMatchObject({ bannerOff: true, movesOnTurn: true });
    expect(parseInitiative({ ...initiative, bannerOff: 'yes', movesOnTurn: 1 })).not.toHaveProperty('bannerOff');
    const shared = { id: '1'.repeat(24), x: 1, y: 1, size: 62, cells: 1, rotation: 0, art: null, name: null, ring: null, claim: null, badge: null, ui: null };
    expect(parseTokens([{ ...shared, turn: true }])?.[0]?.turn).toBe(true);
    expect(parseTokens([{ ...shared, turn: 'yes' }])?.[0]).not.toHaveProperty('turn');
  });
});

describe('players who move only on their turn', () => {
  it('may move a token that fights only while it holds the turn, and one outside the fight always', () => {
    expect(movesOutOfTurn(state(fight('hero')), ON, 'ogre')).toBe(true);
    expect(movesOutOfTurn(state(fight('ogre')), ON, 'ogre')).toBe(false);
    expect(movesOutOfTurn(state(fight('hero')), ON, 'cart')).toBe(false);
    expect(movesOutOfTurn(state(fight('hero')), { ...ON, movesOnTurn: false }, 'ogre')).toBe(false);
    expect(movesOutOfTurn(state({ ...fight('hero'), isActive: false }), ON, 'ogre')).toBe(false);
    // By sides, while its side holds the turn
    const sides = fight('none', { sides: { first: 'players', active: 'players' } });
    expect(movesOutOfTurn(state(sides), ON, 'hero')).toBe(false);
    expect(movesOutOfTurn(state(sides), ON, 'ogre')).toBe(true);
    // A turn nobody is shown holds nobody: the player view's list off, or the GM's tracker closed
    expect(movesOutOfTurn(state(fight('hero')), { ...ON, showInitiative: false }, 'ogre')).toBe(false);
    expect(movesOutOfTurn(state(fight('hero'), false), ON, 'ogre')).toBe(false);
  });

  it('are refused by the move check, after ownership', () => {
    const context = { scene: 's', listedToken: () => 'ogre', ownerOf: () => ANA, tokens, map: null, walls: null };
    const move = { t: 'move' as const, scene: 's', id: '1'.repeat(24), x: 5, y: 5 };
    expect(checkMove(ANA, move, { ...context, outOfTurn: () => true })).toEqual({ ok: false, reason: 'turn' });
    expect(checkMove('b'.repeat(20), move, { ...context, outOfTurn: () => true })).toEqual({ ok: false, reason: 'owner' });
    expect(checkMove(ANA, move, context).ok).toBe(true);
  });

  async function table(movesOnTurn: boolean, active: string) {
    const initial = { ...sceneState({ background: 'maps/cave.png', objects: { ...sceneState().objects, tokens: { hero: token('hero', { x: 105 }), ogre: token('ogre', { x: 315 }) } } }), initiative: fight(active), initiativeTrackerOpen: true } as SceneState;
    const owners = boundOwnership([{ id: ANA, name: 'Ana' }]);
    owners.welcome([{ id: ANA, name: 'Ana' }]);
    owners.give(['hero'], {}, ANA);
    const share = shareHarness(initial, new Map([['maps/cave.png', PNG_1000x800]]), owners);
    share.settings = { ...share.settings, movesOnTurn };
    share.share.start();
    await share.set(initial);
    await share.advance(TOKEN_INTERVAL_MS);
    return share;
  }

  it('tell the page the turn on the tokens it sees', async () => {
    const share = await table(false, 'ogre');
    const listed = tokenLists(share.sent).at(-1)?.tokens ?? [];
    expect(listed.filter((shared) => shared.turn).map((shared) => shared.x)).toEqual([315]);
  });

  it('send the refusal down the usual path, and take the move where the GM did not choose it', async () => {
    const refusedFor = async (movesOnTurn: boolean): Promise<string[]> => {
      const share = await table(movesOnTurn, 'ogre');
      const listed = tokenLists(share.sent).at(-1);
      const hero = listed?.tokens.find((shared) => shared.x === 105)?.id ?? '';
      share.share.receive(ANA, { t: 'move', scene: listed?.scene ?? '', id: hero, x: 500, y: 300 });
      return share.sent.filter(({ body }) => body.t === 'move-refused').map(({ body }) => (body as Extract<GmMessage, { t: 'move-refused' }>).id === hero ? 'hero' : 'other');
    };
    expect(await refusedFor(true)).toEqual(['hero']);
    expect(await refusedFor(false)).toEqual([]);
  });
});
