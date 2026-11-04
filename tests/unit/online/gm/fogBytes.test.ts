import { constants, createDeflateRaw } from 'node:zlib';
import { ALL_PLAYERS, PROTOCOL_VERSION } from '../../../../src/app/online/protocol/index.ts';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import { describe, expect, it } from 'vitest';
import { messageParts } from '../../../../src/app/online/gm/assetServe.ts';
import { sceneState, shareHarness, type Sent } from './shareHarness.ts';

/**
 * What the GM uploads while painting fog on a scene already fogged in preparation: a stroke ends
 * every `STROKE_MS`, each a long brush stroke as a pointer gives it (world coordinates with every
 * digit), painting, erasing, undoing and redoing. Bytes a second of frames as the relay gets them,
 * and after the relay's permessage-deflate (one stream with context takeover, flushed per frame).
 */

const STROKE_MS = 1_500;
/** Points a two-second stroke gives at 60 pointer events a second. */
const STROKE_POINTS = 120;

/** The frames a message goes out in, as `TableConnection` sends them. */
function frames({ body, to }: Sent): string[] {
  let id = 0;
  return messageParts(body, () => String((id += 1))).map((part) => JSON.stringify({ v: PROTOCOL_VERSION, t: 'send', to: to ?? ALL_PLAYERS, body: part }));
}

/** The bytes of frames after permessage-deflate: one stream, each frame flushed, its 4-byte tail dropped. */
async function deflatedBytes(texts: readonly string[]): Promise<number> {
  const stream = createDeflateRaw();
  let total = 0;
  stream.on('data', (chunk: Buffer) => (total += chunk.length));
  for (const text of texts) {
    stream.write(Buffer.from(text));
    await new Promise<void>((resolve) => stream.flush(constants.Z_SYNC_FLUSH, () => resolve()));
    total -= 4;
  }
  stream.end();
  return total;
}

/** A brush stroke of `STROKE_POINTS` points along a wavy line from a place, as a pointer drew it. */
function brush(id: string, timestamp: number, at: number, isErasing = false): FogOperation {
  const points = Array.from({ length: STROKE_POINTS }, (_, index) => ({
    x: 200 + ((at * 431.7) % 2400) + index * 6.137 + Math.sin(index * 0.37 + at) * 41.29,
    y: 200 + ((at * 977.3) % 2400) + Math.cos(index * 0.23 + at) * 63.71 + index * 1.913,
  }));
  return { id, kind: 'fog', timestamp, isErasing, type: 'brush', points, brushRadius: 35 };
}

/** The fog the GM prepared: the map covered, then some of it painted and erased. */
function prepared(): Record<string, FogOperation> {
  const fog: Record<string, FogOperation> = { cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 0, y: 0, width: 3000, height: 3000 } };
  for (let index = 0; index < 20; index += 1) fog[`prep${index}`] = brush(`prep${index}`, 2 + index, index, index % 2 === 0);
  return fog;
}

/** What each step does to the fog: paint or erase a stroke, or undo or redo the last. */
const SESSION: readonly ('paint' | 'erase' | 'undo' | 'redo')[] = [
  'erase', 'erase', 'erase', 'paint', 'erase', 'undo', 'erase', 'erase', 'paint', 'paint', 'undo', 'undo', 'redo',
  'erase', 'erase', 'paint', 'erase', 'erase', 'erase', 'paint', 'undo', 'erase', 'erase', 'erase',
];

async function measurePainting(): Promise<{ readonly raw: number; readonly deflated: number; readonly messages: number }> {
  const base = sceneState();
  let fog = prepared();
  const table = shareHarness(sceneState({ objects: { ...base.objects, fog } }), new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]));
  table.share.start();
  await table.advance(2_000);
  table.sent.length = 0;
  const past: Record<string, FogOperation>[] = [];
  const future: Record<string, FogOperation>[] = [];
  for (const [step, action] of SESSION.entries()) {
    if (action === 'undo') {
      future.push(fog);
      fog = past.pop() ?? fog;
    } else if (action === 'redo') {
      past.push(fog);
      fog = future.pop() ?? fog;
    } else {
      past.push(fog);
      future.length = 0;
      const id = `stroke${step}`;
      fog = { ...fog, [id]: brush(id, 100 + step, 50 + step, action === 'erase') };
    }
    await table.set(sceneState({ objects: { ...base.objects, fog } }));
    await table.advance(STROKE_MS);
  }
  const sent = table.sent.filter(({ body }) => body.t === 'fog' || (body.t === 'delta' && body.of === 'fog'));
  const texts = sent.flatMap(frames);
  const ms = SESSION.length * STROKE_MS;
  const perSecond = (bytes: number): number => Math.round((bytes * 1000) / ms);
  return { raw: perSecond(texts.reduce((sum, text) => sum + Buffer.byteLength(text), 0)), deflated: perSecond(await deflatedBytes(texts)), messages: sent.length };
}

describe('what the GM uploads while painting fog', () => {
  it('is the strokes that changed, not the whole fog again', async () => {
    const fog = await measurePainting();
    console.info(`GM upload of fog, bytes/s while painting and erasing: ${JSON.stringify(fog)}`);
    expect(fog.messages).toBe(SESSION.length);
    // The whole fog each time went out at 85 KB/s (40 KB/s deflated); only what changed is about 3 KB/s.
    expect(fog.raw).toBeLessThan(5_000);
    expect(fog.deflated).toBeLessThan(2_500);
  });
});
