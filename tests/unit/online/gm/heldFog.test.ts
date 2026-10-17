// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import { INPUT_INTERVAL_MS } from '../../../../src/app/online/gm/InputShare.ts';
import { sceneState, shareHarness } from './shareHarness.ts';

const rect = (id: string, x: number): FogOperation => ({ id, kind: 'fog', timestamp: x, isErasing: false, type: 'rectangle', x, y: 0, width: 100, height: 100 });

describe('fog an online table is sent under cloud reveal', () => {
  it('keeps players on the fog from before an edit until the GM leaves the fog tools', async () => {
    const before = { a: rect('a', 10) };
    const edited = { ...before, b: rect('b', 777.5) };
    const scene = sceneState({ objects: { ...sceneState().objects, fog: before } });
    const table = shareHarness(scene, new Map([['maps/cave.webp', new Uint8Array([9])]]));
    table.share.start();
    await table.advance(INPUT_INTERVAL_MS);

    await table.set({ ...scene, fogHeld: before, objects: { ...scene.objects, fog: edited } });
    await table.advance(INPUT_INTERVAL_MS);
    expect(JSON.stringify(table.sent.map(({ body }) => body))).not.toContain('777.5');

    await table.set({ ...scene, fogHeld: null, objects: { ...scene.objects, fog: edited } });
    await table.advance(INPUT_INTERVAL_MS);
    expect(JSON.stringify(table.sent.map(({ body }) => body))).toContain('777.5');
  });
});
