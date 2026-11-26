import { describe, expect, it } from 'vitest';
import { scenes, sceneState as state, shareHarness, type ShareHarness, type Sent } from './shareHarness.ts';

const MAP = new Uint8Array(4000).map((_, index) => index % 251);
const ANA = 'player-ana';
const STALE = 'ffffffffffffffffffffffff';

async function table(): Promise<ShareHarness> {
  const shared = shareHarness(state(), new Map([['maps/cave.webp', MAP]]));
  shared.share.start();
  await shared.set(state());
  return shared;
}

const sceneId = (shared: ShareHarness): string => scenes(shared.sent).at(-1)?.id ?? '';
const scenesTo = (sent: readonly Sent[], to: string): number => sent.filter(({ body, to: target }) => body.t === 'scene' && target === to).length;

describe('a player out of step with the shared scene', () => {
  it('is sent the scene again when their roll names a scene no longer shared', async () => {
    const shared = await table();
    const before = shared.sent.length;
    shared.share.receive(ANA, { t: 'roll', scene: STALE, formula: '1d20', token: null });
    await shared.settle();
    const after = shared.sent.slice(before);
    expect(after.some(({ body, to }) => body.t === 'roll-refused' && to === ANA)).toBe(true);
    expect(scenesTo(after, ANA)).toBe(1);
    expect(after.some(({ body, to }) => body.t === 'tokens' && to === ANA)).toBe(true);
  });

  it('is sent the scene again when their move names a scene no longer shared', async () => {
    const shared = await table();
    const before = shared.sent.length;
    shared.share.receive(ANA, { t: 'move', scene: STALE, id: 'a'.repeat(24), x: 10, y: 10 });
    await shared.settle();
    expect(scenesTo(shared.sent.slice(before), ANA)).toBe(1);
  });

  it('is caught up at most once a second', async () => {
    const shared = await table();
    const before = shared.sent.length;
    for (let roll = 0; roll < 3; roll++) shared.share.receive(ANA, { t: 'roll', scene: STALE, formula: '1d20', token: null });
    await shared.settle();
    expect(scenesTo(shared.sent.slice(before), ANA)).toBe(1);
    await shared.advance(1000);
    shared.share.receive(ANA, { t: 'roll', scene: STALE, formula: '1d20', token: null });
    await shared.settle();
    expect(scenesTo(shared.sent.slice(before), ANA)).toBe(2);
  });

  it('hears nothing more when they name the scene shared', async () => {
    const shared = await table();
    const before = shared.sent.length;
    shared.share.receive(ANA, { t: 'roll', scene: sceneId(shared), formula: '1d20', token: null });
    await shared.settle();
    expect(scenesTo(shared.sent.slice(before), ANA)).toBe(0);
  });
});
