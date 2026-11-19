import type { FogOperation } from '../../../../src/app/types/fogTypes';
import { describe, expect, it } from 'vitest';
import { PLAYER_SETTINGS } from './gmLighting.ts';
import { sceneState, sequenced, shareHarness, type ShareHarness } from './shareHarness.ts';

const cover: FogOperation = { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 0, y: 0, width: 500, height: 500 };

async function fogged(): Promise<ShareHarness> {
  const table = shareHarness(sceneState({ objects: { ...sceneState().objects, fog: { cover } } }), new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]));
  table.settings = { ...PLAYER_SETTINGS, fogEdge: { style: 'crackle', width: 40 } };
  table.share.start();
  await table.advance(2_000);
  return table;
}

describe('the fog edge players are sent', () => {
  it('goes with the fog as the GM set it', async () => {
    const table = await fogged();
    const fog = sequenced(table.sent, 'fog');
    expect(fog.at(-1)).toMatchObject({ edge: { style: 'crackle', width: 40 }, fog: [{ type: 'rectangle', erase: false }] });
  });

  it('goes again when the GM changes it, with the same fog, as a change from the last', async () => {
    const table = await fogged();
    const before = sequenced(table.sent, 'fog').at(-1);
    const sent = table.sent.length;
    table.settings = { ...PLAYER_SETTINGS, fogEdge: { style: 'soft', width: 0 } };
    await table.advance(2_000);
    const changes = table.sent.slice(sent).map(({ body }) => body);
    expect(changes).toEqual([expect.objectContaining({ t: 'delta', of: 'fog', set: { edge: { style: 'soft', width: 0 } } })]);
    expect(sequenced(table.sent, 'fog').at(-1)).toEqual({ ...before, seq: (before?.seq ?? 0) + 1, edge: { style: 'soft', width: 0 } });
  });

  it('is left out where Atlas\'s setting cannot be read, so players keep a hard edge', async () => {
    const table = await fogged();
    table.settings = PLAYER_SETTINGS;
    await table.advance(2_000);
    expect(sequenced(table.sent, 'fog').at(-1)).not.toHaveProperty('edge');
  });
});
