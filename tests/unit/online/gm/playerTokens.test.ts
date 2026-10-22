import type { SharedToken } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import { describe, expect, it } from 'vitest';
import { Ownership } from '../../../../src/app/online/gm/ownership.ts';
import { boundOwnership } from './fakeSeats.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = sceneState().mapPath ?? '';
const ART = new Map([['maps/cave.webp', new Uint8Array([1])], ['art/hero.webp', new Uint8Array([2])], ['art/ogre.webp', new Uint8Array([3])], ['art/spy.webp', new Uint8Array([4])]]);

const named = (id: string, x: number, changes: Partial<TokenEntity> = {}): TokenEntity => ({ ...token(id, { x, ...changes }), kind: 'character', name: id });
/** A seeing hero (a player token by default), an ogre (the GM's) and a seeing spy the GM hid. */
const TOKENS = [named('hero', 1, { vision: { enabled: true } }), named('ogre', 2), named('spy', 3, { vision: { enabled: true }, isHidden: true })];
const withTokens = (tokens = TOKENS): ReturnType<typeof sceneState> => sceneState({ objects: { ...sceneState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) } });

const mineTo = (table: ShareHarness, player: string): readonly string[] | undefined => table.sent.flatMap(({ body, to }) => (body.t === 'mine' && to === player ? [body] : [])).at(-1)?.tokens;
/** A GM token in the last list, found by its place (names are not always sent). */
const listed = (table: ShareHarness, id: string): SharedToken | undefined => tokenLists(table.sent).at(-1)?.tokens.find((entry) => entry.x === TOKENS.find((gm) => gm.id === id)?.x);

async function table(showNames = false): Promise<{ readonly share: ShareHarness; readonly owners: Ownership; readonly scene: string; readonly send: (from: string, t: 'claim' | 'release', id: string | undefined) => Promise<void> }> {
  const owners = boundOwnership([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
  owners.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
  const share = shareHarness(withTokens(), ART, owners);
  share.settings = { ...share.settings, showNames };
  owners.onChange(() => share.share.ownersChanged());
  share.share.start();
  await share.set(withTokens());
  await share.advance(TOKEN_INTERVAL_MS);
  const scene = tokenLists(share.sent).at(-1)?.scene ?? '';
  return {
    share, owners, scene,
    send: async (from, t, id) => {
      share.share.receive(from, { t, scene, id });
      await share.advance(TOKEN_INTERVAL_MS);
    },
  };
}

describe('player tokens', () => {
  it('are named to players even without nameplates, never offered to claim, and never a hidden one', async () => {
    const { share } = await table();
    const tokens = tokenLists(share.sent).at(-1)?.tokens ?? [];
    expect(tokens.map(({ name, claim }) => [name, claim])).toEqual([['hero', 'taken'], [null, null]]);
    expect(JSON.stringify(share.sent)).not.toContain('spy');
  });

  it('are given by the GM alone: a claim an older page sends changes nothing and is answered with nothing', async () => {
    const { share, owners, send } = await table();
    const hero = listed(share, 'hero')?.id;
    const before = share.sent.length;
    await send(ANA, 'claim', hero);
    await send(BEN, 'claim', listed(share, 'ogre')?.id);
    expect([owners.ownerOf('hero', undefined), owners.ownerOf('ogre', undefined)]).toEqual([undefined, undefined]);
    expect(share.sent.slice(before)).toEqual([]);
    owners.give(['hero'], {}, ANA);
    await share.advance(TOKEN_INTERVAL_MS);
    expect(mineTo(share, ANA)).toEqual([hero]);
    await send(BEN, 'claim', hero);
    expect(owners.ownerOf('hero', undefined)).toBe(ANA);
  });

  it('let no player give a token back, its owner neither: the GM does', async () => {
    const { share, owners, send } = await table();
    const hero = listed(share, 'hero')?.id;
    owners.give(['hero'], {}, ANA);
    await share.advance(TOKEN_INTERVAL_MS);
    await send(BEN, 'release', hero);
    await send(ANA, 'release', hero);
    expect(owners.ownerOf('hero', undefined)).toBe(ANA);
    expect(mineTo(share, ANA)).toEqual([hero]);
    owners.give(['hero'], {}, null);
    await share.advance(TOKEN_INTERVAL_MS);
    expect(listed(share, 'hero')?.claim).toBe('taken');
    expect(mineTo(share, ANA)).toEqual([]);
  });

  it('follow the GM: a token made the GM\'s is taken back and loses its name, one made a player token is named', async () => {
    const { share, owners } = await table();
    owners.give(['hero'], {}, ANA);
    owners.markPlayerTokens(MAP, ['hero'], {}, false);
    owners.markPlayerTokens(MAP, ['ogre'], {}, true);
    await share.advance(TOKEN_INTERVAL_MS);
    const tokens = tokenLists(share.sent).at(-1)?.tokens ?? [];
    expect(tokens.map(({ name, claim }) => [name, claim])).toEqual([[null, null], ['ogre', 'taken']]);
    expect(mineTo(share, ANA)).toEqual([]);
  });

  it('keep the other tokens\' names to Atlas\'s nameplate setting', async () => {
    const { share } = await table(true);
    expect(tokenLists(share.sent).at(-1)?.tokens.map(({ name }) => name)).toEqual(['hero', 'ogre']);
  });
});
