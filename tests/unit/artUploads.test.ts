import { describe, expect, it, vi } from 'vitest';
import { TextureSource } from 'pixi.js';
import { ArtUploads, ART_UPLOAD_BUDGET_MS, ART_UPLOAD_HELD_BUDGET_MS, TOKENS_PER_FRAME, type ArtUploader } from '../../src/app/pixi/token-renderer/artUploads';
import { manualTicker } from '../mocks/manualTicker';

/** A renderer whose uploads each take `costMs` of a clock the queue reads; a source already uploaded costs nothing. */
function setup(costMs: number, held = false, othersLoading?: (waiting: number) => boolean) {
  const { ticker, advance } = manualTicker();
  let clock = 0;
  const uploaded: TextureSource[] = [];
  const renderer: ArtUploader = {
    texture: {
      initSource: (source) => {
        if (uploaded.includes(source)) return;
        clock += costMs;
        uploaded.push(source);
      },
    },
  };
  let current: ArtUploader | null = renderer;
  let isHeld = held;
  const uploads = new ArtUploads({ ticker, renderer: () => current, held: () => isHeld, now: () => clock, ...(othersLoading && { othersLoading }) });
  const frame = async (): Promise<void> => {
    advance(16);
    await Promise.resolve();
  };
  return { uploads, uploaded, frame, ticker, setRenderer: (r: ArtUploader | null): void => { current = r; }, setHeld: (h: boolean): void => { isHeld = h; } };
}

const sources = (n: number): TextureSource[] => Array.from({ length: n }, (_, i) => new TextureSource({ label: `art-${i}` }));

describe('ArtUploads', () => {
  it('uploads the art nearest the view first, a few textures a frame within the budget', async () => {
    const cost = ART_UPLOAD_BUDGET_MS / 2 - 0.5;
    const { uploads, uploaded, frame } = setup(cost);
    const [far, near, middle, farther] = sources(4);
    const done: string[] = [];
    for (const [source, distance] of [[far, 300], [near, 10], [middle, 100], [farther, 900]] as const) {
      void uploads.whenUploaded(source, distance).then(() => done.push(source.label));
    }
    expect(uploaded).toEqual([]);

    await frame();
    expect(uploaded).toEqual([near, middle, far]);
    expect(done).toEqual(['art-1', 'art-2', 'art-0']);

    await frame();
    expect(uploaded).toEqual([near, middle, far, farther]);
  });

  it('takes more of each frame while a load holds the canvas', async () => {
    const { uploads, uploaded, frame } = setup(ART_UPLOAD_BUDGET_MS, true);
    for (const source of sources(20)) void uploads.whenUploaded(source, 0);
    await frame();
    expect(uploaded).toHaveLength(ART_UPLOAD_HELD_BUDGET_MS / ART_UPLOAD_BUDGET_MS);
  });

  it('waits while a load holds the canvas and other tokens are still being prepared, never outside a load', async () => {
    let preparing = 3;
    const { uploads, uploaded, frame, setHeld } = setup(1, true, (waiting) => preparing > waiting);
    const [a, b] = sources(2);
    void uploads.whenUploaded(a!, 0);
    void uploads.whenUploaded(b!, 1);
    await frame();
    expect(uploaded).toEqual([]);
    preparing = 2;
    await frame();
    expect(uploaded).toEqual([a, b]);

    const [c] = sources(1);
    preparing = 5;
    setHeld(false);
    void uploads.whenUploaded(c!, 0);
    await frame();
    expect(uploaded).toEqual([a, b, c]);
  });

  it('uploads at least one texture a frame, however long one takes', async () => {
    const { uploads, uploaded, frame } = setup(40);
    for (const source of sources(3)) void uploads.whenUploaded(source, 0);
    await frame();
    expect(uploaded).toHaveLength(1);
    await frame();
    await frame();
    expect(uploaded).toHaveLength(3);
  });

  it('lets a few tokens go on a frame outside a load, also when their art is on the GPU, and every one during a load', async () => {
    const { uploads, frame, setHeld } = setup(0);
    const [art] = sources(1);
    let gone = 0;
    for (let i = 0; i < TOKENS_PER_FRAME * 2 + 1; i++) void uploads.whenUploaded(art!, i).then(() => gone++);
    await frame();
    expect(gone).toBe(TOKENS_PER_FRAME);
    setHeld(true);
    await frame();
    expect(gone).toBe(TOKENS_PER_FRAME * 2 + 1);
  });

  it('uploads art shared by several tokens once', async () => {
    const { uploads, uploaded, frame } = setup(1);
    const [art] = sources(1);
    const both = Promise.all([uploads.whenUploaded(art!, 50), uploads.whenUploaded(art!, 5)]);
    await frame();
    await both;
    expect(uploaded).toEqual([art]);
  });

  it('waits for nothing without a renderer, and lets every waiting token go when it is destroyed', async () => {
    const { uploads, uploaded, setRenderer } = setup(1);
    const [a, b] = sources(2);
    const waiting = uploads.whenUploaded(a!, 0);
    uploads.destroy();
    await waiting;
    setRenderer(null);
    await uploads.whenUploaded(b!, 0);
    expect(uploaded).toEqual([]);
  });

  it('lets a token go on when its upload fails, and keeps uploading the others', async () => {
    const { ticker, advance } = manualTicker();
    const [bad, good] = sources(2);
    const initSource = vi.fn((source: TextureSource) => {
      if (source === bad) throw new Error('context lost');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const uploads = new ArtUploads({ ticker, renderer: () => ({ texture: { initSource } }), held: () => true, now: () => 0 });
    const both = Promise.all([uploads.whenUploaded(bad!, 0), uploads.whenUploaded(good!, 1)]);
    advance(16);
    await both;
    expect(initSource).toHaveBeenCalledTimes(2);
  });

  it('leaves the ticker once nothing waits', async () => {
    const { uploads, frame, ticker } = setup(1);
    void uploads.whenUploaded(sources(1)[0]!, 0);
    expect(ticker.count).toBe(1);
    await frame();
    expect(ticker.count).toBe(0);
  });
});
