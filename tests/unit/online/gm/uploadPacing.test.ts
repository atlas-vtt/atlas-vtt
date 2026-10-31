import { describe, expect, it } from 'vitest';
import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { AssetPublisher } from '../../../../src/app/online/gm/assets/AssetPublisher.ts';
import type { OfferAnswer, OfferedAsset, PartsSession, TilesProgress } from '../../../../src/app/online/gm/assets/assetRoutes.ts';
import { ASSET_USES } from '../../../../src/app/online/gm/assets/assetUses.ts';
import type { StoreResult } from '../../../../src/app/online/gm/assets/storeClient.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { pyramidOf } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import { pyramidTesserae, type StoredTesseraSize } from '../../../../src/app/pixi/mosaicCanvas/tesseraBlobs';
import { pngOf } from './fakeTileCache.ts';
import { FakeUplink, percentiles, type UplinkOptions } from './fakeUplink.ts';
import { settled } from './settled.ts';
import { kept } from './fakeStoring.ts';

/** The map's pyramid as this device's cache holds it: every tile stored. */
interface CachedPyramid {
  readonly hash: string;
  readonly tiles: readonly StoredTesseraSize[];
}

/*
 * How the uploads share the GM's uplink with the table's live frames, in the MODEL of `fakeUplink.ts`
 * (read its assumptions: TCP flows keep a window of bytes in one FIFO bottleneck whose buffer they
 * share; this is no measurement of a real network). The real `AssetPublisher` and its pacing
 * (`uploadPace.ts`) run on simulated time while a 300 MB video (multipart, 16 MiB parts the store
 * sets) and a 120 MB tile pyramid go up, and three players' table sends marks every 100 ms and a token
 * list every 500 ms. Compared: the pacing rule as implemented, with players connected, against four
 * requests at once without the rule (the publisher told nobody plays).
 *
 * Numbers (flow window 256 KiB, router buffer 512 KiB, base round trip 40 ms, steps of 10 ms; added
 * delay of live frames p50 / p95 / max in ms, upload time in s), as measured in this model:
 *
 * Before tuning (two requests with players, one once the keep-alive passes twice its resting time):
 *   10 Mbit/s  rule      201 / 409 / 410   342 s     unpaced   409 / 410 / 575   341 s
 *   20 Mbit/s  rule       95 / 200 / 200   171 s     unpaced   200 / 200 / 294   170 s
 * Two flows fill the 512 KiB buffer as four do. The keep-alive (every 30 s) sees the queue only once
 * two requests fill it, and the drop to one request waits for a free turn, after a 16 MiB part (13 s
 * at 10 Mbit/s), so more than one frame in twenty met the full buffer.
 *
 * After tuning (one request at a time while players are connected; four while nobody plays):
 *   10 Mbit/s  rule      201 / 203 / 203   342 s     unpaced   409 / 410 / 575   341 s
 *   20 Mbit/s  rule       95 /  96 /  96   171 s     unpaced   200 / 200 / 294   170 s
 * One flow's window alone keeps the line busy (five times the bandwidth-delay product), so a second
 * request adds queue and no speed. A part's size does not enter the model: a flow's queue is its
 * window, not its body. What a large part costs is the wait of a more urgent asset for the next free
 * turn (up to one part's time on the line); the store sets the parts (16 MiB), the GM cannot.
 * The table printed below is what each run measures.
 */

const MIB = 1024 * 1024;
const SALT = Uint8Array.from({ length: 32 }, (_, n) => n);
const STEP_MS = 10;
const LIMIT_MS = 30 * 60 * 1000;
const VIDEO_PATH = 'maps/river.webm';
const MAP_PATH = 'maps/keep.webp';
const VIDEO_BYTES = 300 * 1000 * 1000;
const PYRAMID_BYTES = 120 * 1000 * 1000;
const MARK_BYTES = 300;
const TOKENS_BYTES = 5000;

/** The store as the uplink carries it: every request's body crosses the bottleneck, and the store holds what arrives. */
class UplinkStore {
  videoStored = false;
  pyramidStored = false;
  private readonly pieces = new Map<string, number>();
  private readonly held = new Map<string, number>();

  constructor(private readonly uplink: FakeUplink) {}

  offer(assets: readonly OfferedAsset[]): Promise<StoreResult<Map<string, OfferAnswer>>> {
    const answers = new Map<string, OfferAnswer>();
    for (const asset of assets) {
      if (asset.tiles !== undefined) this.pieces.set(asset.id, asset.tiles.count + 1);
      answers.set(asset.id, asset.kind === 'tiles' ? { answer: 'need', upload: 'tiles', partBytes: 8 * MIB } : { answer: 'need', upload: asset.size > 95 * MIB ? 'multipart' : 'single', partBytes: 16 * MIB });
    }
    return Promise.resolve({ ok: true, value: answers });
  }

  async putWhole(_id: string, body: ArrayBuffer): Promise<StoreResult<null>> {
    await this.uplink.request(body.byteLength);
    return { ok: true, value: null };
  }

  startParts(): Promise<StoreResult<PartsSession>> {
    return Promise.resolve({ ok: true, value: { uploadId: 'u', arrived: new Set() } });
  }

  async putPart(_id: string, _part: number, body: ArrayBuffer): Promise<StoreResult<null>> {
    await this.uplink.request(body.byteLength);
    return { ok: true, value: null };
  }

  complete(): Promise<StoreResult<null>> {
    this.videoStored = true;
    return Promise.resolve({ ok: true, value: null });
  }

  async putTiles(id: string, body: ArrayBuffer): Promise<StoreResult<TilesProgress>> {
    await this.uplink.request(body.byteLength);
    const parts = Buffer.from(body).toString('latin1').split('; name="').length - 1;
    const held = (this.held.get(id) ?? 0) + parts;
    this.held.set(id, held);
    const of = this.pieces.get(id) ?? 0;
    if (held >= of) this.pyramidStored = true;
    return { ok: true, value: { stored: held >= of, pieces: held, of } };
  }
}

interface Run {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly seconds: number;
}

/** Simulated time and its timers. */
function simTimers(): { now: () => number; setTimer: (run: () => void, ms: number) => number; clearTimer: (id: number) => void; runDue: (at: number) => void; set: (at: number) => void } {
  let time = 0;
  let ids = 0;
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  return {
    now: () => time,
    setTimer: (run, ms) => (timers.set((ids += 1), { at: time + ms, run }), ids),
    clearTimer: (id) => void timers.delete(id),
    set: (at) => (time = at),
    runDue: (at) => {
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > at) break;
        timers.delete(id);
        timer.run();
      }
    },
  };
}

const sizeOf = (body: GmMessage): number => JSON.stringify(body).length;

/** Uploads the video and the pyramid over the model while the table's live lane runs; `paced`: the publisher hears players are connected. */
async function simulate(bitsPerSecond: number, paced: boolean, video: Uint8Array<ArrayBuffer>, image: Uint8Array<ArrayBuffer>, facts: CachedPyramid): Promise<Run> {
  const options: UplinkOptions = { bitsPerSecond, baseRttMs: 40, flowWindow: 256 * 1024, routerBuffer: 512 * 1024 };
  const uplink = new FakeUplink(options);
  const store = new UplinkStore(uplink);
  const timers = simTimers();
  const publisher = new AssetPublisher({
    client: store,
    salt: { soon: () => Promise.resolve(SALT) },
    timers,
    readFile: (path) => Promise.resolve(path === VIDEO_PATH ? video : null),
    stat: (path) => (path === VIDEO_PATH ? { mtime: 1, size: video.length } : path === MAP_PATH ? { mtime: 1, size: image.length } : null),
    connection: () => ({ players: paced ? 3 : 0, latencyMs: uplink.lastRttMs }),
    connected: () => ['ana', 'bo', 'cleo'],
    send: (body) => uplink.live(sizeOf(body), false),
    sendLive: (body) => uplink.live(sizeOf(body), false),
    notify: () => undefined,
    signedOutByServer: () => undefined,
    pyramids: {
      build: () => Promise.resolve({ hash: facts.hash, complete: true }),
      level: (_hash, level) => Promise.resolve({ width: 14_000, height: 9_200, decodedScale: 1, level, tesserae: facts.tiles.filter((tile) => tile.level === level) }),
      blobs: (_hash, tiles) => Promise.resolve(tiles.map((tile) => new ArrayBuffer(facts.tiles.find((stored) => stored.level === tile.level && stored.col === tile.col && stored.row === tile.row)?.bytes ?? 0))),
      focus: () => null,
    },
  });
  // The keep-alive before anything goes up: the resting round trip.
  uplink.keepAlive();
  const videoRef = await publisher.storing.fileRef(VIDEO_PATH, 'video/webm', ASSET_USES.video);
  const mapRef = kept(await publisher.storing.mapRef(image, 'image/webp', MAP_PATH));
  expect(videoRef?.id).toBeDefined();
  expect(mapRef.tiles).toBe(true);
  let now = 0;
  while (!(store.videoStored && store.pyramidStored)) {
    now += STEP_MS;
    if (now > LIMIT_MS) throw new Error('The uploads did not end');
    timers.set(now);
    timers.runDue(now);
    if (now % 100 === 0) uplink.live(MARK_BYTES, true);
    if (now % 500 === 0) uplink.live(TOKENS_BYTES, true);
    if (now % 30_000 === 0) uplink.keepAlive();
    uplink.step(now, STEP_MS);
    // Hashing and every promise the step resolved run before the clock moves on.
    await settled();
  }
  publisher.stop();
  return { ...percentiles(uplink.liveDelays), seconds: Math.round(now / 1000) };
}

describe('uploads sharing the GM\'s uplink with the live lane (a model)', () => {
  it('keep the live frames\' added delay low with players connected and the uploads close to their unpaced time', { timeout: 300_000 }, async () => {
    const video = new Uint8Array(VIDEO_BYTES);
    const image = pngOf(14_000, 9_200);
    const pyramid = pyramidOf(14_000, 9_200);
    const tiles = pyramidTesserae(pyramid);
    const facts: CachedPyramid = { hash: await sha256Hex(image), tiles: tiles.map((ref) => ({ ...ref, bytes: Math.floor(PYRAMID_BYTES / tiles.length) })) };
    const rows: string[] = [];
    const runs = new Map<string, Run>();
    for (const mbit of [10, 20]) {
      for (const paced of [true, false]) {
        const run = await simulate(mbit * 1_000_000, paced, video, image, facts);
        runs.set(`${mbit}/${paced ? 'rule' : 'unpaced'}`, run);
        rows.push(`${String(mbit).padStart(2)} Mbit/s  ${(paced ? 'rule' : 'unpaced').padEnd(8)}  p50 ${run.p50.toFixed(0).padStart(4)} ms  p95 ${run.p95.toFixed(0).padStart(4)} ms  max ${run.max.toFixed(0).padStart(4)} ms  upload ${String(run.seconds).padStart(4)} s`);
      }
    }
    console.log(`Uploads beside the live lane (model of fakeUplink.ts):\n${rows.join('\n')}`);
    const rule = runs.get('10/rule');
    const unpaced = runs.get('10/unpaced');
    expect(rule?.p95).toBeLessThan(250);
    expect(rule?.max).toBeLessThan(500);
    expect(rule?.seconds ?? Infinity).toBeLessThanOrEqual(1.5 * (unpaced?.seconds ?? 0));
  });
});
