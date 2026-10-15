// @vitest-environment node
import type { GmMessage, PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { checkMove, MOVE_BURST, MOVES_PER_SECOND, MoveRate, type MoveContext } from '../../../../src/app/online/gm/moveCheck.ts';
import { Ownership, readOwnership } from '../../../../src/app/online/gm/ownership.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sceneState, shareHarness, token, tokenLists } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const ALIAS = '1'.repeat(24);

const context = (changes: Partial<MoveContext> = {}): MoveContext => ({
  scene: 's',
  listedToken: (alias) => (alias === ALIAS ? 'ogre' : undefined),
  ownerOf: (id) => (id === 'ogre' ? ANA : undefined),
  tokens: { ogre: token('ogre') },
  map: { width: 1000, height: 800 },
  walls: null,
  ...changes,
});
const move = (changes: Partial<PlayerMove> = {}): PlayerMove => ({ t: 'move', scene: 's', id: ALIAS, x: 500, y: 400, ...changes });

describe('checking a player\'s move', () => {
  it('takes the owner\'s move of a listed token to a place on the map, edges included', () => {
    expect(checkMove(ANA, move(), context())).toEqual({ ok: true, tokenId: 'ogre', x: 500, y: 400 });
    expect(checkMove(ANA, move({ x: 0, y: 800 }), context()).ok).toBe(true);
  });

  it('refuses someone else\'s token, a token players do not see or that is hidden now, and another scene', () => {
    expect(checkMove(BEN, move(), context())).toEqual({ ok: false, reason: 'owner' });
    expect(checkMove(ANA, move({ id: '2'.repeat(24) }), context())).toEqual({ ok: false, reason: 'token' });
    expect(checkMove(ANA, move(), context({ tokens: { ogre: token('ogre', { isHidden: true }) } }))).toEqual({ ok: false, reason: 'token' });
    expect(checkMove(ANA, move(), context({ tokens: {} }))).toEqual({ ok: false, reason: 'token' });
    expect(checkMove(ANA, move({ scene: 'old' }), context())).toEqual({ ok: false, reason: 'scene' });
    expect(checkMove(ANA, move(), context({ scene: null }))).toEqual({ ok: false, reason: 'scene' });
  });

  it('refuses a place that is no finite number or lies outside the map', () => {
    for (const place of [{ x: Number.NaN }, { y: Number.POSITIVE_INFINITY }, { x: Number.NEGATIVE_INFINITY }, { x: -1 }, { x: 1000.5 }, { y: 801 }]) {
      expect(checkMove(ANA, move(place), context()), JSON.stringify(place)).toEqual({ ok: false, reason: 'place' });
    }
    expect(checkMove(ANA, move({ x: -50 }), context({ map: null })).ok).toBe(true);
    expect(checkMove(ANA, move({ x: Number.NaN }), context({ map: null })).ok).toBe(false);
  });

  it('allows a burst of moves, then a few a second, per player', () => {
    const rate = new MoveRate();
    for (let count = 0; count < MOVE_BURST; count += 1) expect(rate.take(ANA, 0)).toBe(true);
    expect(rate.take(ANA, 0)).toBe(false);
    expect(rate.take(BEN, 0)).toBe(true);
    expect(rate.take(ANA, 1000 / MOVES_PER_SECOND)).toBe(true);
    expect(rate.take(ANA, 1000 / MOVES_PER_SECOND)).toBe(false);
  });
});

/** A PNG's signature and header for a 1000 × 800 image: all `imageDimensions` reads. */
const PNG_1000x800 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0xe8, 0, 0, 0x03, 0x20, 8, 6]);

describe('moves through the shared scene', () => {
  async function table(): Promise<{ readonly share: ReturnType<typeof shareHarness>; readonly alias: (x: number) => string }> {
    const initial = sceneState({
      background: 'maps/cave.png',
      objects: { ...sceneState().objects, tokens: { ogre: token('ogre', { x: 105 }), bear: token('bear', { x: 315 }), ghost: token('ghost', { x: 525, isHidden: true }) } },
    });
    const owners = new Ownership(readOwnership(undefined), () => undefined);
    owners.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
    owners.give(['ogre', 'ghost'], {}, ANA);
    const share = shareHarness(initial, new Map([['maps/cave.png', PNG_1000x800]]), owners);
    share.share.start();
    await share.set(initial);
    await share.advance(TOKEN_INTERVAL_MS);
    const alias = (x: number): string => tokenLists(share.sent).at(-1)?.tokens.find((entry) => entry.x === x)?.id ?? '';
    return { share, alias };
  }
  const sceneOf = (share: ReturnType<typeof shareHarness>): string => tokenLists(share.sent).at(-1)?.scene ?? '';
  const refusals = (sent: readonly { readonly body: GmMessage; readonly to: string | undefined }[]): unknown[] => sent.filter(({ body }) => body.t === 'move-refused');

  it('puts the owner\'s token down and sends everyone the new list', async () => {
    const { share, alias } = await table();
    const ogre = alias(105);
    share.share.receive(ANA, { t: 'move', scene: sceneOf(share), id: ogre, x: 735, y: 315 });
    await share.advance(TOKEN_INTERVAL_MS);
    const listed = tokenLists(share.sent).at(-1);
    expect(listed?.tokens.find((entry) => entry.id === ogre)).toMatchObject({ x: 735, y: 315 });
    expect(listed?.tokens.at(-1)?.id).toBe(ogre);
    expect(refusals(share.sent)).toEqual([]);
  });

  it('sends a refused move back to its sender alone, with the place players see or none for a hidden token', async () => {
    const { share, alias } = await table();
    const scene = sceneOf(share);
    const bear = alias(315);
    share.share.receive(ANA, { t: 'move', scene, id: bear, x: 735, y: 315 });
    share.share.receive(ANA, { t: 'move', scene, id: alias(105), x: 1200, y: 315 });
    share.share.receive(ANA, { t: 'move', scene, id: 'f'.repeat(24), x: 10, y: 10 });
    share.share.receive(BEN, { t: 'move', scene, id: alias(105), x: 10, y: 'NaN' });
    expect(refusals(share.sent)).toEqual([
      { body: { t: 'move-refused', scene, id: bear, x: 315, y: 100 }, to: ANA },
      { body: { t: 'move-refused', scene, id: alias(105), x: 105, y: 100 }, to: ANA },
      { body: { t: 'move-refused', scene, id: 'f'.repeat(24), x: null, y: null }, to: ANA },
    ]);
  });
});
