import type { GmMessage, PlayerDrag, PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { parseMoveRefused } from '../../../../src/app/online/protocol/moves.ts';
import { parseTokens } from '../../../../src/app/online/protocol/tokens.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { holdTokens } from '../../../../src/app/lighting/sightOnDrop';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../../../src/app/types/initiativeTypes';
import { boundOwnership } from './fakeSeats.ts';
import { sceneState, shareHarness, token, tokenLists } from './shareHarness.ts';
import { ALIAS, ANA, SCENE, STORE_FACTORY, table as realTable, type StoreFactory } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };

const PLAYER = 'a'.repeat(20);
/** A PNG's signature and header for a 1000 × 800 image: all `imageDimensions` reads. */
const PNG_1000x800 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0xe8, 0, 0, 0x03, 0x20, 8, 6]);

const entry = (tokenId: string, order: number, isActive: boolean): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 10, initiativeModifier: 0, imagePath: '', isActive, isNPC: true, order,
});
/** The ogre has the turn; the hero (the player's) fights too, the cart does not. */
const fight = (): InitiativeState => ({ ...createDefaultInitiativeState(), isActive: true, round: 1, entries: [entry('ogre', 0, true), entry('hero', 1, false)] });

interface Options {
  movesOnTurn?: boolean;
  showInitiative?: boolean;
  trackerOpen?: boolean;
}

async function table({ movesOnTurn = true, showInitiative = true, trackerOpen = true }: Options = {}) {
  const tokens = { hero: token('hero', { x: 105 }), ogre: token('ogre', { x: 315 }), cart: token('cart', { x: 525 }) };
  const initial = { ...sceneState({ background: 'maps/cave.png', objects: { ...sceneState().objects, tokens } }), initiative: fight(), initiativeTrackerOpen: trackerOpen } as SceneState;
  const owners = boundOwnership([{ id: PLAYER, name: 'Ana' }]);
  owners.welcome([{ id: PLAYER, name: 'Ana' }]);
  owners.give(['hero', 'cart'], {}, PLAYER);
  const share = shareHarness(initial, new Map([['maps/cave.png', PNG_1000x800]]), owners);
  share.settings = { ...share.settings, movesOnTurn, showInitiative };
  share.share.start();
  await share.set(initial);
  await share.advance(TOKEN_INTERVAL_MS);
  const listed = tokenLists(share.sent).at(-1);
  const aliasAt = (x: number): string => listed?.tokens.find((shared) => shared.x === x)?.id ?? '';
  const held = (listed?.tokens ?? []).filter((shared) => shared.held).map((shared) => shared.x);
  const refusals = (): Extract<GmMessage, { t: 'move-refused' }>[] => share.sent.flatMap(({ body }) => (body.t === 'move-refused' ? [body] : []));
  const move = (x: number): void => share.share.receive(PLAYER, { t: 'move', scene: listed?.scene ?? '', id: aliasAt(x), x: 500, y: 300 });
  return { share, held, refusals, move };
}

describe('tokens that wait for their turn', () => {
  it('are named by the GM on the token list: a token in the fight that does not hold the turn, never one outside it', async () => {
    expect((await table()).held).toEqual([105]);
    expect((await table({ movesOnTurn: false })).held).toEqual([]);
  });

  it('wait only while the players are shown the turn: with the list off or the tracker closed nobody waits and nothing is refused', async () => {
    for (const options of [{ showInitiative: false }, { trackerOpen: false }]) {
      const { held, refusals, move } = await table(options);
      expect(held, JSON.stringify(options)).toEqual([]);
      move(105);
      expect(refusals(), JSON.stringify(options)).toEqual([]);
    }
  });

  it('are refused with the turn as the reason; a token outside the fight moves, and other refusals give no reason', async () => {
    const { refusals, move, share } = await table();
    move(105);
    move(525);
    // The ogre is not the player's: refused, but not for the turn
    move(315);
    expect(refusals().map(({ reason }) => reason ?? 'none')).toEqual(['turn', 'none']);
    expect(share.sent.some(({ body }) => body.t === 'move-refused' && body.reason === undefined && body.x === 315)).toBe(true);
  });

  it('are refused with the reason at the drop of a drag, after a GM\'s hold, and not for other refusals', async () => {
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
    const drag = (x: number, y: number): PlayerDrag => ({ t: 'drag', scene: SCENE, id: ALIAS.ogre, x, y });
    const drop = (x: number, y: number): PlayerMove => ({ t: 'move', scene: SCENE, id: ALIAS.ogre, x, y });
    let waits = false;
    const t = realTable(createViewAtlasStore, () => null, () => waits);
    // A drag begun on the turn and dropped once the turn passed on
    t.moves.drag(ANA, drag(200, 140));
    waits = true;
    t.moves.receive(ANA, drop(220, 150));
    expect(t.sent.map(({ body }) => (body.t === 'move-refused' ? body.reason : null))).toEqual(['turn']);
    // A move held while the GM drags, refused once the drag is done
    t.sent.length = 0;
    holdTokens(t.store, ['bear']);
    t.moves.receive(ANA, drop(735, 315));
    holdTokens(t.store, []);
    await tick();
    expect(t.sent.map(({ body }) => (body.t === 'move-refused' ? body.reason : null))).toEqual(['turn']);
    // The rate limit refuses without a reason
    waits = false;
    t.sent.length = 0;
    for (let count = 0; count < 12; count++) t.moves.receive(ANA, drop(600 + count, 300));
    expect(t.sent.length).toBeGreaterThan(0);
    expect(t.sent.every(({ body }) => body.t === 'move-refused' && body.reason === undefined)).toBe(true);
  });
});

describe('reading the new fields', () => {
  it('reads held and the turn reason as true and turn only, anything else as unset', () => {
    const shared = { id: '1'.repeat(24), x: 1, y: 1, size: 62, cells: 1, rotation: 0, art: null, name: null, ring: null, claim: null, badge: null, ui: null };
    expect(parseTokens([{ ...shared, held: true }])?.[0]?.held).toBe(true);
    for (const held of ['yes', 1, false, null]) expect(parseTokens([{ ...shared, held }])?.[0], String(held)).not.toHaveProperty('held');
    const refused = { t: 'move-refused', scene: 's', id: '1'.repeat(24), x: 5, y: 6 };
    expect(parseMoveRefused({ ...refused, reason: 'turn' })).toEqual({ ...refused, reason: 'turn' });
    expect(parseMoveRefused({ ...refused, x: null, y: null, reason: 'turn' })?.reason).toBe('turn');
    for (const reason of ['wall', 'TURN', 1, null]) expect(parseMoveRefused({ ...refused, reason }), String(reason)).toEqual(refused);
  });
});
