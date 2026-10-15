// @vitest-environment node
import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { Ownership, readOwnership } from '../../../../src/app/online/gm/ownership.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const ART = new Map([['maps/cave.webp', new Uint8Array([1])], ['art/f.webp', new Uint8Array([2])], ['art/r.webp', new Uint8Array([3])], ['art/x.webp', new Uint8Array([4])]]);

const withTokens = (...tokens: ReturnType<typeof token>[]): ReturnType<typeof sceneState> =>
  sceneState({ objects: { ...sceneState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) } });

type Mine = Extract<GmMessage, { t: 'mine' }>;
const mineTo = (table: ShareHarness, player: string): Mine[] => table.sent.flatMap(({ body, to }) => (body.t === 'mine' && to === player ? [body] : []));

/** The players' id of a GM token in the last list, found by its place. */
function aliasAt(table: ShareHarness, x: number): string | undefined {
  return tokenLists(table.sent).at(-1)?.tokens.find((entry) => entry.x === x)?.id;
}

async function table(initial = withTokens(token('f', { x: 1 }), token('r', { x: 2 }), token('x', { x: 3, isHidden: true }))): Promise<{ readonly share: ShareHarness; readonly owners: Ownership }> {
  const owners = new Ownership(readOwnership(undefined), () => undefined);
  owners.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
  const share = shareHarness(initial, ART, owners);
  owners.onChange(() => share.share.ownersChanged());
  share.share.start();
  await share.set(initial);
  await share.advance(TOKEN_INTERVAL_MS);
  return { share, owners };
}

describe('mine flags', () => {
  it('tell each player alone which tokens of the list are theirs, and the list stays one for all', async () => {
    const { share, owners } = await table();
    owners.give(['f'], {}, ANA);
    owners.give(['r'], {}, BEN);
    expect(mineTo(share, ANA).at(-1)?.tokens).toEqual([aliasAt(share, 1)]);
    expect(mineTo(share, BEN).at(-1)?.tokens).toEqual([aliasAt(share, 2)]);
    expect(share.sent.filter(({ body }) => body.t === 'tokens').every(({ to }) => to === undefined)).toBe(true);
    const anaTraffic = JSON.stringify(share.sent.filter(({ to }) => to === ANA || to === undefined));
    expect(anaTraffic).not.toContain(JSON.stringify([aliasAt(share, 2)]));
  });

  it('never name a hidden token, even one the player owns', async () => {
    const { share, owners } = await table();
    owners.give(['x', 'f'], {}, ANA);
    expect(mineTo(share, ANA).at(-1)?.tokens).toEqual([aliasAt(share, 1)]);
    await share.set(withTokens(token('f', { x: 1, isHidden: true }), token('r', { x: 2 }), token('x', { x: 3 })));
    await share.advance(TOKEN_INTERVAL_MS);
    expect(mineTo(share, ANA).at(-1)?.tokens).toEqual([aliasAt(share, 3)]);
  });

  it('go out only when a player\'s share changes, and once more, after the list, to a player who comes back', async () => {
    const { share, owners } = await table();
    owners.give(['f'], {}, ANA);
    const count = mineTo(share, ANA).length;
    await share.set(withTokens(token('f', { x: 1 }), token('r', { x: 5 }), token('x', { x: 3, isHidden: true })));
    await share.advance(TOKEN_INTERVAL_MS);
    expect(mineTo(share, ANA)).toHaveLength(count);
    owners.left(ANA);
    share.share.resend(ANA);
    owners.joined({ id: ANA, name: 'Ana' });
    expect(mineTo(share, ANA)).toHaveLength(count + 1);
    expect(share.sent.slice(-4).map(({ body, to }) => [body.t, to])).toEqual([['scene', ANA], ['tokens', ANA], ['fog', ANA], ['mine', ANA]]);
  });

  it('are taken back when the GM gives a token to nobody or removes its player', async () => {
    const { share, owners } = await table();
    owners.give(['f', 'r'], {}, ANA);
    expect(mineTo(share, ANA).at(-1)?.tokens).toHaveLength(2);
    owners.give(['r'], {}, null);
    expect(mineTo(share, ANA).at(-1)?.tokens).toEqual([aliasAt(share, 1)]);
    owners.remove(ANA);
    const before = share.sent.length;
    owners.give(['f'], {}, BEN);
    expect(share.sent.slice(before).map(({ to }) => to)).toEqual([BEN]);
  });
});
