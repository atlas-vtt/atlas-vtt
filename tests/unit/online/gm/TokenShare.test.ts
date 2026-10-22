import { parseGmMessage, TOKEN_ID_PATTERN } from '../../../../src/app/online/protocol/index.ts';
import { computeTokenPixelSize } from '../../../../src/app/pixi/token-renderer/tokenSizing';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { ringColour } from '../../../../src/app/online/gm/scenePicture.ts';
import { TOKEN_INTERVAL_MS, TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { GRID_SIZE, sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const ART = new Map([
  ['maps/cave.webp', new Uint8Array([1, 2, 3])],
  ['art/a.webp', new Uint8Array([4, 5, 6])],
  ['art/b.webp', new Uint8Array([7, 8, 9])],
]);

const withTokens = (...tokens: ReturnType<typeof token>[]): ReturnType<typeof sceneState> =>
  sceneState({ objects: { ...sceneState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) } });

async function started(initial = withTokens(token('a'), token('b'))): Promise<ShareHarness> {
  const table = shareHarness(initial, ART);
  table.share.start();
  await table.set(initial);
  await table.advance(TOKEN_INTERVAL_MS);
  return table;
}

const lastList = (table: ShareHarness): ReturnType<typeof tokenLists>[number] | undefined => tokenLists(table.sent).at(-1);

describe('the tokens players see', () => {
  it('go out with place, size, rotation, artwork and ring, known by random ids only', async () => {
    const table = await started(withTokens(token('a', { x: 210, y: 35, size: 1.5, rotation: 450, ringColor: '#F80', layer: 2 }), token('b', { showRing: false })));
    const list = lastList(table);
    expect(list?.tokens.map((entry) => entry.id).every((id) => TOKEN_ID_PATTERN.test(id))).toBe(true);
    const [b, a] = list?.tokens ?? [];
    expect(a).toMatchObject({ x: 210, y: 35, size: computeTokenPixelSize(GRID_SIZE, 1.5), rotation: 90, ring: { colour: '#ff8800' } });
    expect(a?.art).toEqual({ hash: await sha256Hex(new Uint8Array([4, 5, 6])), size: 3, mime: 'image/webp' });
    expect(b?.ring).toBeNull();
    expect(table.sent.every(({ body }) => parseGmMessage(JSON.parse(JSON.stringify(body))) !== null)).toBe(true);
    expect(JSON.stringify(table.sent)).not.toMatch(/"a"|"b"|art\//);
  });

  it('leave out a hidden token and one the players do not see', async () => {
    const table = await started();
    expect(lastList(table)?.tokens).toHaveLength(2);
    await table.set(withTokens(token('a', { isHidden: true }), token('b')));
    await table.advance(TOKEN_INTERVAL_MS);
    expect(lastList(table)?.tokens).toHaveLength(1);
    table.perception = (id) => (id === 'b' ? 'sensed' : 'seen');
    await table.advance(TOKEN_POLL_MS);
    expect(lastList(table)?.tokens).toEqual([]);
  });

  it('follow a drag at most every interval, and the last place always goes out', async () => {
    const table = await started();
    const before = tokenLists(table.sent).length;
    for (let step = 1; step <= 20; step += 1) {
      await table.set(withTokens(token('a', { x: 100 + step }), token('b')));
      await table.advance(10);
    }
    await table.advance(TOKEN_INTERVAL_MS);
    const lists = tokenLists(table.sent).slice(before);
    expect(lists.length).toBeLessThanOrEqual(Math.ceil((20 * 10) / TOKEN_INTERVAL_MS) + 1);
    expect(lists.at(-1)?.tokens[0]?.x).toBe(120);
  });

  it('follow a held token at the same pace: its motion goes through the live lane', async () => {
    const table = await started();
    const before = tokenLists(table.sent).length;
    for (let step = 1; step <= 50; step += 1) {
      await table.set({ ...withTokens(token('a', { x: 100 + step }), token('b')), heldTokens: { a: { x: 100, y: 100 } } });
      await table.advance(10);
    }
    const lists = tokenLists(table.sent).slice(before);
    expect(lists.length).toBeLessThanOrEqual(Math.ceil((50 * 10) / TOKEN_INTERVAL_MS) + 1);
    expect(table.sent.filter(({ body }) => body.t === 'live').length).toBeGreaterThan(lists.length);
  });

  it('send nothing while the scene loads or the tab has no renderer, and catch up after', async () => {
    const table = shareHarness(withTokens(token('a')), ART);
    table.rendered = false;
    table.share.start();
    await table.set(withTokens(token('a')));
    await table.advance(TOKEN_INTERVAL_MS);
    expect(tokenLists(table.sent)).toEqual([]);
    table.rendered = true;
    await table.advance(TOKEN_POLL_MS);
    expect(lastList(table)?.tokens).toHaveLength(1);
    const count = table.sent.length;
    await table.set({ ...withTokens(token('a', { x: 500 })), isMapLoading: true });
    await table.advance(TOKEN_POLL_MS * 2);
    expect(table.sent.length).toBe(count);
  });

  it('go again to a player who joins, after the scene', async () => {
    const table = await started();
    table.sent.length = 0;
    table.share.resend('alice');
    expect(table.sent.map(({ body, to }) => [body.t, to])).toEqual([['scene', 'alice'], ['tokens', 'alice'], ['fog', 'alice']]);
  });
});

describe('token artwork', () => {
  it('is served only while a token the players see shows it', async () => {
    const table = await started();
    const hash = await sha256Hex(new Uint8Array([4, 5, 6]));
    table.sent.length = 0;
    table.share.receive('alice', { t: 'asset-request', hash });
    await table.settle();
    expect(table.sent.map(({ body, to }) => [body.t, to])).toEqual([['asset-chunk', 'alice']]);
    await table.set(withTokens(token('a', { isHidden: true }), token('b')));
    await table.advance(TOKEN_INTERVAL_MS);
    table.sent.length = 0;
    table.share.receive('bob', { t: 'asset-request', hash });
    await table.settle();
    expect(table.sent).toEqual([{ body: { t: 'asset-refused', hash }, to: 'bob' }]);
  });
});

describe('ring colours', () => {
  it('are #rrggbb, white for anything else', () => {
    expect(ringColour('#ABC')).toBe('#aabbcc');
    expect(ringColour(undefined)).toBe('#ffffff');
    expect(ringColour('red; background: url(x)')).toBe('#ffffff');
  });
});
