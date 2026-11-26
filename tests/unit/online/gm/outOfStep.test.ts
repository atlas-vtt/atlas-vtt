import { describe, expect, it } from 'vitest';
import type { Mark } from './playerPages.ts';
import { scenes, sceneState as state, shareHarness, type ShareHarness } from './shareHarness.ts';

const MAP = new Uint8Array(4000).map((_, index) => index % 251);
const ANA = 'player-ana';
const STALE = 'ffffffffffffffffffffffff';

async function table(): Promise<ShareHarness> {
  const shared = shareHarness(state(), new Map([['maps/cave.webp', MAP]]));
  shared.pages.join(ANA);
  shared.share.start();
  await shared.set(state());
  return shared;
}

const sceneId = (shared: ShareHarness): string => scenes(shared.sent).at(-1)?.id ?? '';
/** The scenes Ana's page was sent after `mark`. */
const scenesTo = (shared: ShareHarness, mark: Mark): number => shared.pages.of(ANA).since(mark, 'scene').length;

describe('a player out of step with the shared scene', () => {
  it('is sent the scene again when their roll names a scene no longer shared', async () => {
    const shared = await table();
    const before = shared.pages.mark();
    shared.share.receive(ANA, { t: 'roll', scene: STALE, formula: '1d20', token: null });
    await shared.settle();
    const after = shared.pages.of(ANA).since(before);
    expect(after.some(({ t }) => t === 'roll-refused')).toBe(true);
    expect(scenesTo(shared, before)).toBe(1);
    expect(after.some(({ t }) => t === 'tokens')).toBe(true);
  });

  it('is sent the scene again when their move names a scene no longer shared', async () => {
    const shared = await table();
    const before = shared.pages.mark();
    shared.share.receive(ANA, { t: 'move', scene: STALE, id: 'a'.repeat(24), x: 10, y: 10 });
    await shared.settle();
    expect(scenesTo(shared, before)).toBe(1);
  });

  it('is caught up at most once a second', async () => {
    const shared = await table();
    const before = shared.pages.mark();
    for (let roll = 0; roll < 3; roll++) shared.share.receive(ANA, { t: 'roll', scene: STALE, formula: '1d20', token: null });
    await shared.settle();
    expect(scenesTo(shared, before)).toBe(1);
    await shared.advance(1000);
    shared.share.receive(ANA, { t: 'roll', scene: STALE, formula: '1d20', token: null });
    await shared.settle();
    expect(scenesTo(shared, before)).toBe(2);
  });

  it('hears nothing more when they name the scene shared', async () => {
    const shared = await table();
    const before = shared.pages.mark();
    shared.share.receive(ANA, { t: 'roll', scene: sceneId(shared), formula: '1d20', token: null });
    await shared.settle();
    expect(scenesTo(shared, before)).toBe(0);
  });
});
