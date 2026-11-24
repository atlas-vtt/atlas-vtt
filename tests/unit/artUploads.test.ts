import { describe, expect, it, vi } from 'vitest';
import { TextureSource } from 'pixi.js';
import { ArtUploads, type ArtUploader } from '../../src/app/pixi/token-renderer/artUploads';
import { manualTicker } from '../mocks/manualTicker';

/** A renderer whose uploads each take `costMs` of a clock the queue reads. */
function setup(costMs = 5, budgetMs = 12) {
  const { ticker, advance } = manualTicker();
  let clock = 0;
  const uploaded: TextureSource[] = [];
  const renderer: ArtUploader = {
    texture: {
      initSource: (source) => {
        clock += costMs;
        uploaded.push(source);
      },
    },
  };
  let current: ArtUploader | null = renderer;
  const uploads = new ArtUploads({ ticker, renderer: () => current, budgetMs: () => budgetMs, now: () => clock });
  return { uploads, uploaded, advance, ticker, setRenderer: (r: ArtUploader | null): void => { current = r; } };
}

const sources = (n: number): TextureSource[] => Array.from({ length: n }, (_, i) => new TextureSource({ label: `art-${i}` }));

describe('ArtUploads', () => {
  it('uploads the art nearest the view first, a few textures a frame within the budget', async () => {
    const { uploads, uploaded, advance } = setup(5, 12);
    const [far, near, middle, farther] = sources(4);
    const done: string[] = [];
    for (const [source, distance] of [[far, 300], [near, 10], [middle, 100], [farther, 900]] as const) {
      void uploads.whenUploaded(source, distance).then(() => done.push(source.label));
    }
    expect(uploaded).toEqual([]);

    advance(16);
    await Promise.resolve();
    expect(uploaded).toEqual([near, middle, far]);
    expect(done).toEqual(['art-1', 'art-2', 'art-0']);

    advance(16);
    await Promise.resolve();
    expect(uploaded).toEqual([near, middle, far, farther]);
  });

  it('uploads at least one texture a frame, however long one takes', () => {
    const { uploads, uploaded, advance } = setup(40, 12);
    const art = sources(3);
    for (const source of art) void uploads.whenUploaded(source, 0);
    advance(16);
    expect(uploaded).toHaveLength(1);
    advance(32);
    expect(uploaded).toHaveLength(3);
  });

  it('uploads art shared by several tokens once and lets all of them go on', async () => {
    const { uploads, uploaded, advance } = setup();
    const [art] = sources(1);
    const first = uploads.whenUploaded(art!, 50);
    const second = uploads.whenUploaded(art!, 5);
    advance(16);
    await Promise.all([first, second]);
    expect(uploaded).toEqual([art]);
  });

  it('waits for nothing without a renderer, and lets every waiting token go when it is destroyed', async () => {
    const { uploads, uploaded, setRenderer } = setup();
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
    const uploads = new ArtUploads({ ticker, renderer: () => ({ texture: { initSource } }), budgetMs: () => 100 });
    const both = Promise.all([uploads.whenUploaded(bad!, 0), uploads.whenUploaded(good!, 1)]);
    advance(16);
    await both;
    expect(initSource).toHaveBeenCalledTimes(2);
  });

  it('leaves the ticker once nothing waits', () => {
    const { uploads, advance, ticker } = setup();
    void uploads.whenUploaded(sources(1)[0]!, 0);
    expect(ticker.count).toBe(1);
    advance(16);
    expect(ticker.count).toBe(0);
  });
});
