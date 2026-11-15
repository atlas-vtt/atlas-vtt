import { describe, expect, it } from 'vitest';
import { ANNOTATION_BYTES_PER_SECOND, MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DrawingStroke } from '../../../../src/app/types';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { sceneState, shareHarness, type ShareHarness } from './shareHarness.ts';

const annotationsOf = (table: ShareHarness): Extract<GmMessage, { t: 'annotations' }>[] => table.sent.flatMap(({ body }) => (body.t === 'annotations' ? [body] : []));
const pen = (id: string, points: number, colour = '#e93147'): DrawingStroke => ({
  id, kind: 'drawing', timestamp: 1, type: 'pen', points: Array.from({ length: points }, (_, index) => ({ x: 100 + index * 0.37, y: 100 + (index % 9) * 1.13 })), color: colour, width: 4, opacity: 1,
});

describe('how fast the drawings and texts go out', () => {
  it('tells a long list no more often than its size allows, and what changed meanwhile as one', async () => {
    // A level full of drawings: each change of one of them tells the whole list to everyone.
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`d${index}`, pen(`d${index}`, 40)]));
    let state = sceneState({ objects: { ...sceneState().objects, drawings: many } });
    const table = shareHarness(state, new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]));
    table.layers = fakeLayers({ state: () => state, source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 } });
    table.share.start();
    await table.set(state);
    await table.advance(MAP_LAYER_INTERVAL_MS);
    expect(annotationsOf(table)).toHaveLength(1);
    const bytes = JSON.stringify(annotationsOf(table)[0]).length;
    const wait = (bytes / ANNOTATION_BYTES_PER_SECOND) * 1000;
    expect(wait).toBeGreaterThan(4 * MAP_LAYER_INTERVAL_MS);
    // Ten changes, one every layer interval: a player picking colours as fast as the GM takes them.
    for (let change = 0; change < 10; change += 1) {
      state = { ...state, objects: { ...state.objects, drawings: { ...state.objects.drawings, d0: pen('d0', 40, `#00000${change}`) } } };
      await table.set(state);
      await table.advance(MAP_LAYER_INTERVAL_MS);
    }
    const during = annotationsOf(table).length - 1;
    expect(during).toBeLessThanOrEqual(Math.ceil((10 * MAP_LAYER_INTERVAL_MS) / wait) + 1);
    expect(during).toBeLessThan(10);
    // The last change is told once the list may go out again, without another change to wake it.
    await table.advance(wait + MAP_LAYER_INTERVAL_MS);
    expect(JSON.stringify(annotationsOf(table).at(-1))).toContain('#000009');
    const told = annotationsOf(table).length;
    await table.advance(2000);
    expect(annotationsOf(table)).toHaveLength(told);
  });

  it('holds a short list by the layers\' own pace alone', async () => {
    let state = sceneState({ objects: { ...sceneState().objects, drawings: { d0: pen('d0', 4) } } });
    const table = shareHarness(state, new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]));
    table.layers = fakeLayers({ state: () => state, source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 } });
    table.share.start();
    await table.set(state);
    await table.advance(MAP_LAYER_INTERVAL_MS);
    for (let change = 0; change < 5; change += 1) {
      state = { ...state, objects: { ...state.objects, drawings: { d0: pen('d0', 4, `#00000${change}`) } } };
      await table.set(state);
      await table.advance(MAP_LAYER_INTERVAL_MS);
    }
    expect(annotationsOf(table)).toHaveLength(6);
  });
});
