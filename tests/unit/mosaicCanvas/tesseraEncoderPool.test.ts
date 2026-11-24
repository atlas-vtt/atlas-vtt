// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EncoderReply, EncoderRequest } from '../../../src/app/pixi/mosaicCanvas/tesseraEncoderProtocol';
import { ENCODER_TIMEOUT_MS, TesseraEncoderPool } from '../../../src/app/pixi/mosaicCanvas/tesseraEncoderPool';
import { coreHarness, fakePng, FakeBitmap, FakeTesseraGraphics, useReadableBlobs } from './fakeTesseraGraphics';

type Answer = (request: EncoderRequest) => EncoderReply | null;

/** An encoder's end of its channel: answers with `answer` a task later, or never where it gives null. */
class FakeEncoderPort extends EventTarget {
  onmessage: ((event: MessageEvent<EncoderReply>) => void) | null = null;
  readonly received: Array<{ request: EncoderRequest; transfer: Transferable[] }> = [];
  closed = false;

  constructor(private readonly answer: Answer) {
    super();
  }

  postMessage(request: EncoderRequest, transfer: Transferable[] = []): void {
    this.received.push({ request, transfer });
    const reply = this.answer(request);
    if (reply) setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: reply })), 0);
  }

  close(): void {
    this.closed = true;
  }

  start(): void {}
}

const encoded = (text: string, type: string): { bytes: ArrayBuffer; type: string } => ({ bytes: new TextEncoder().encode(text).buffer, type });
const encodes: Answer = ({ id, bitmap }) => ({ id, encoded: bitmap ? encoded('remote', 'image/webp') : null });
const asPorts = (ports: FakeEncoderPort[]): MessagePort[] => ports.map((port) => port as unknown as MessagePort);
const rect = { x: 510, y: 0, width: 512, height: 300 };
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

describe('TesseraEncoderPool', () => {
  useReadableBlobs();
  afterEach(() => vi.useRealTimers());

  it('encodes on its own thread, one at a time, without encoders', async () => {
    const graphics = new FakeTesseraGraphics();
    const pool = new TesseraEncoderPool(graphics);
    const source = new FakeBitmap(1024, 300, 'resized');
    expect(pool.slots).toBe(1);
    await pool.encode(source, rect);
    expect(graphics.encodes).toEqual([{ source, rect }]);
  });

  it('asks for encoders once, when it is first to encode without any', async () => {
    const want = vi.fn();
    const pool = new TesseraEncoderPool(new FakeTesseraGraphics(), want);
    expect(want).not.toHaveBeenCalled();
    await pool.encode(new FakeBitmap(1024, 300, 'resized'), rect);
    await pool.encode(new FakeBitmap(1024, 300, 'resized'), rect);
    expect(want).toHaveBeenCalledTimes(1);
  });

  it('sends each tessera’s crop to the idlest live encoder, transferred, and answers its blob', async () => {
    const graphics = new FakeTesseraGraphics();
    const pool = new TesseraEncoderPool(graphics);
    const ports = [new FakeEncoderPort(encodes), new FakeEncoderPort(encodes)];
    pool.attach(asPorts(ports));
    expect(pool.slots).toBe(1);
    await settle();
    expect(pool.slots).toBe(4);
    const blobs = await Promise.all([0, 1].map(() => pool.encode(new FakeBitmap(1024, 300, 'resized'), rect)));
    expect(await Promise.all(blobs.map((blob) => blob.text()))).toEqual(['remote', 'remote']);
    expect(graphics.encodes).toEqual([]);
    const sent = ports.map((port) => port.received.at(-1)!);
    for (const { request, transfer } of sent) {
      expect(request.bitmap).toMatchObject({ origin: 'crop', width: rect.width, height: rect.height });
      expect(transfer).toEqual([request.bitmap]);
    }
  });

  it('never uses an encoder that did not answer, nor one that failed, and encodes those tesserae itself', async () => {
    const graphics = new FakeTesseraGraphics();
    const pool = new TesseraEncoderPool(graphics);
    const silent = new FakeEncoderPort(() => null);
    const failing = new FakeEncoderPort(({ id, bitmap }) => (bitmap ? { id, error: 'out of memory' } : { id, encoded: null }));
    pool.attach(asPorts([silent, failing]));
    await settle();
    const source = new FakeBitmap(1024, 300, 'resized');
    await pool.encode(source, rect);
    expect(graphics.encodes).toEqual([{ source, rect }]);
    expect(pool.slots).toBe(1);
    await pool.encode(source, rect);
    expect(failing.received).toHaveLength(2);
    expect(silent.received).toHaveLength(1);
  });

  it('takes an encoder that writes another format than this thread for one it cannot use', async () => {
    const graphics = new FakeTesseraGraphics();
    const pool = new TesseraEncoderPool(graphics);
    pool.attach(asPorts([new FakeEncoderPort(({ id, bitmap }) => ({ id, encoded: bitmap ? encoded('png', 'image/png') : null }))]));
    await settle();
    const blob = await pool.encode(new FakeBitmap(1024, 300, 'resized'), rect);
    expect(blob.type).toBe('image/webp');
    expect(graphics.encodes).toHaveLength(1);
    expect(pool.slots).toBe(1);
  });

  it('encodes a tessera itself once its encoder stays silent too long', async () => {
    const graphics = new FakeTesseraGraphics();
    const pool = new TesseraEncoderPool(graphics);
    let answering = true;
    pool.attach(asPorts([new FakeEncoderPort((request) => (answering || !request.bitmap ? encodes(request) : null))]));
    await settle();
    answering = false;
    vi.useFakeTimers();
    const encoded = pool.encode(new FakeBitmap(1024, 300, 'resized'), rect);
    await vi.advanceTimersByTimeAsync(ENCODER_TIMEOUT_MS);
    expect(await (await encoded).text()).toContain('"width":512');
    expect(pool.slots).toBe(1);
  });

  it('encodes what an encoder held itself at once when its worker ends', async () => {
    const graphics = new FakeTesseraGraphics();
    const pool = new TesseraEncoderPool(graphics);
    let answering = true;
    const port = new FakeEncoderPort((request) => (answering ? encodes(request) : null));
    pool.attach(asPorts([port]));
    await settle();
    answering = false;
    const encoded = pool.encode(new FakeBitmap(1024, 300, 'resized'), rect);
    await settle();
    port.dispatchEvent(new Event('close'));
    expect(await (await encoded).text()).toContain('"width":512');
    expect(pool.slots).toBe(1);
  });

  it('closes its ports when disposed and encodes what was under way itself', async () => {
    const graphics = new FakeTesseraGraphics();
    const pool = new TesseraEncoderPool(graphics);
    let answering = true;
    const port = new FakeEncoderPort((request) => (answering ? encodes(request) : null));
    pool.attach(asPorts([port]));
    await settle();
    answering = false;
    const encoded = pool.encode(new FakeBitmap(1024, 300, 'resized'), rect);
    await settle();
    pool.dispose();
    await encoded;
    expect(port.closed).toBe(true);
    expect(graphics.encodes).toHaveLength(1);
  });

  it('builds a whole pyramid through the encoders a core was given, every tessera stored once', async () => {
    const h = coreHarness();
    const ports = [new FakeEncoderPort(encodes), new FakeEncoderPort(encodes), new FakeEncoderPort(encodes)];
    h.core.useEncoders(asPorts(ports));
    await settle();
    const outcome = await h.core.prebuild({ path: 'maps/pool.png', size: 32, mtime: 1 }, fakePng(3000, 2000));
    expect(outcome).toMatchObject({ kind: 'prebuilt', complete: true, stored: 33 });
    expect(h.graphics.encodes).toEqual([]);
    expect(ports.reduce((sum, port) => sum + port.received.filter(({ request }) => request.bitmap).length, 0)).toBe(33);
  });
});
