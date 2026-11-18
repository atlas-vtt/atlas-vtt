import { describe, expect, it, vi } from 'vitest';
import { uploadPyramid, type PyramidBatches } from '../../../../src/app/online/gm/assets/pyramidUpload';
import type { TileBatch } from '../../../../src/app/online/gm/assets/pyramidPlan';

const ascii = (value: string): number[] => [...value].map((c) => c.charCodeAt(0));
const PNG = new Uint8Array([0x89, ...ascii('PNG\r\n\x1a\n'), 0, 0, 0, 13, ...ascii('IHDR'), 0, 0, 2, 0, 0, 0, 2, 0, 8, 6, 0, 0, 0]);
const WEBP = new Uint8Array([...ascii('RIFF'), 100, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8L'), 10, 0, 0, 0, 0x2f, 0xff, 0xc1, 0x7f, 0, 0, 0, 0, 0]);

/** One batch of two tiles, the first with the manifest. */
function batches(): PyramidBatches {
  const batch: TileBatch = { tiles: [{ level: 1, col: 0, row: 0, bytes: 1 }, { level: 1, col: 1, row: 0, bytes: 1 }], manifest: true, overview: true };
  return {
    manifest: new TextEncoder().encode('{}').slice(),
    failed: false,
    batch: (next) => (next === 0 ? batch : undefined),
    readyAt: () => true,
    done: (next) => next > 0,
  };
}

/** The parts of a form body as the store reads them: each part's name and the type it was sent under. */
function partsOf(body: ArrayBuffer): Array<{ name: string; type: string }> {
  const text = new TextDecoder('latin1').decode(body);
  return [...text.matchAll(/name="([^"]+)"; filename="[^"]+"\r\nContent-Type: ([^\r]+)\r\n/g)].map((match) => ({ name: match[1] ?? '', type: match[2] ?? '' }));
}

async function upload(tiles: Uint8Array[]): Promise<Array<{ name: string; type: string }>> {
  const putTiles = vi.fn(async (_id: string, _body: ArrayBuffer, _contentType: string) => ({ ok: true as const, value: { stored: true, pieces: 3, of: 3 } }));
  const run = await uploadPyramid({ id: 'a'.repeat(64), hash: 'b'.repeat(64), batches: batches(), next: 0 }, {
    client: { putTiles },
    blobs: async () => tiles.map((tile) => tile.slice().buffer),
    slot: async () => () => undefined,
    boundary: () => 'f'.repeat(32),
    progress: () => undefined,
    sent: () => undefined,
    signal: new AbortController().signal,
  });
  expect(run).toEqual({ end: 'stored', next: 1 });
  return partsOf(putTiles.mock.calls[0]![1]);
}

describe('the tiles of a pyramid on their way to the store', () => {
  it('go up as WebP from a device that encodes WebP', async () => {
    expect(await upload([WEBP, WEBP])).toEqual([
      { name: 'manifest.json', type: 'application/json' },
      { name: '1/0_0', type: 'image/webp' },
      { name: '1/1_0', type: 'image/webp' },
    ]);
  });

  it('go up as PNG from a device whose canvases encode none, each under the type its bytes have', async () => {
    expect(await upload([PNG, WEBP])).toEqual([
      { name: 'manifest.json', type: 'application/json' },
      { name: '1/0_0', type: 'image/png' },
      { name: '1/1_0', type: 'image/webp' },
    ]);
  });
});
