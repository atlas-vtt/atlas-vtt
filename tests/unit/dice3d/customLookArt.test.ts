import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const images = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../src/app/dice3d/dieNumerals', async (original) => ({
  ...(await original<typeof import('../../../src/app/dice3d/dieNumerals')>()),
  loadImage: images.load,
}));

import { installDomHost, getDomHost } from '../../../src/app/host/dom';
import { copyFaceImage, LOOK_ART_TIMEOUT_MS, lookArt, onLateLookArt, registeredLookHasTensArt } from '../../../src/app/dice3d/customLookArt';
import { addCustomLook } from '../../../src/app/dice3d/customLooks';
import type { CustomDiceLook, FaceArtSet } from '../../../src/app/dice3d/customLooks';
import { artKeys, type DieBody } from '../../../src/app/dice3d/dieBody';

/** An image source: its size, and whether drawing it taints the canvas (cross-origin without CORS). */
const source = (width: number, height: number, tainted = false): CanvasImageSource => ({ width, height, tainted }) as unknown as CanvasImageSource;

interface FakeCanvas { width: number; height: number; drawn: unknown[] }

let restore: () => void;
beforeEach(() => {
  const host = getDomHost();
  restore = installDomHost({
    ...host,
    createCanvas: (): HTMLCanvasElement => {
      const canvas: FakeCanvas = { width: 0, height: 0, drawn: [] };
      let tainted = false;
      const ctx = {
        drawImage: (image: { tainted?: boolean }) => { canvas.drawn.push(image); tainted ||= image.tainted === true; },
        getImageData: () => {
          if (tainted) throw new DOMException('tainted', 'SecurityError');
          return { data: new Uint8ClampedArray(4) };
        },
      };
      return Object.assign(canvas, { getContext: () => ctx }) as unknown as HTMLCanvasElement;
    },
  });
  images.load.mockReset();
});
afterEach(() => {
  restore();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const look = (faces: (body: DieBody) => Promise<FaceArtSet>, bump?: CustomDiceLook['bump']): CustomDiceLook =>
  ({ id: 'ext:test', name: 'Test', faces, bump, body: null, ink: null, preview: null });

describe('copyFaceImage', () => {
  it('copies an image at most a cell on its longer side, keeping its shape', () => {
    const copy = copyFaceImage(source(1024, 512)) as unknown as FakeCanvas;
    expect([copy.width, copy.height]).toEqual([256, 128]);
    const small = copyFaceImage(source(40, 60)) as unknown as FakeCanvas;
    expect([small.width, small.height]).toEqual([40, 60]);
  });

  it('refuses an image without a size, one over 8,192 px on a side, and one that would taint the atlas', () => {
    expect(copyFaceImage(source(0, 10))).toBeNull();
    expect(copyFaceImage(source(8193, 10))).toBeNull();
    expect(copyFaceImage(source(64, 64, true))).toBeNull();
  });
});

describe('registeredLookHasTensArt', () => {
  const art = (bodies: DieBody[]) => async (body: DieBody): Promise<FaceArtSet> =>
    (bodies.includes(body) ? Object.fromEntries(artKeys(body).map((key) => [key, source(64, 64)])) : {});

  it('is false with no look, and for a registered look whose art has no tens die', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(registeredLookHasTensArt()).toBe(false);
    const plain = { ...look(art([10, 20])), id: 'ext:plain' };
    const remove = addCustomLook(plain);
    await lookArt(plain);
    expect(registeredLookHasTensArt()).toBe(false);
    remove();
  });

  it("is true once a registered look's art for the tens die has loaded, and false again when it is removed", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tens = { ...look(art([10, 100])), id: 'ext:tens' };
    const remove = addCustomLook(tens);
    expect(registeredLookHasTensArt()).toBe(false);
    await lookArt(tens);
    expect(registeredLookHasTensArt()).toBe(true);
    remove();
    expect(registeredLookHasTensArt()).toBe(false);
  });
});

describe('lookArt', () => {
  it('asks every body once per registration and keeps the art it could take, by key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const faces = vi.fn(async (body: DieBody): Promise<FaceArtSet> => Object.fromEntries(artKeys(body).map((key) => [key, source(64, 64)])));
    const registered = look(faces);
    const art = await lookArt(registered);
    await lookArt(registered);
    expect(faces.mock.calls.map(([body]) => body).sort((a, b) => a - b)).toEqual([4, 6, 8, 10, 12, 20, 100]);
    expect([...art.faces.get(100)!.keys()].sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect([...art.faces.get(20)!.keys()]).toHaveLength(20);
    expect(art.bump.size).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    // A new registration (a new object) asks again.
    await lookArt(look(faces));
    expect(faces).toHaveBeenCalledTimes(14);
  });

  it('leaves out each face it cannot take, and the rest of the die stays', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    images.load.mockImplementation((url: string) => (url === 'bad' ? Promise.reject(new Error('404')) : Promise.resolve(source(32, 32))));
    const art = await lookArt(look(async (body) => (body === 6
      ? { 1: 'good', 2: 'bad', 3: source(9000, 9000), 4: source(64, 64, true), 5: 42 as never, 7: source(10, 10) }
      : {})));
    expect([...art.faces.get(6)!.keys()]).toEqual([1]);
    expect(images.load).toHaveBeenCalledWith('good', true);
    // Logged once for the registration, naming the faces Atlas paints itself.
    expect(warn).toHaveBeenCalledOnce();
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain('failed to load: d6 2');
    expect(line).toContain('too large: d6 3');
    expect(line).toContain('unreadable (cross-origin without CORS): d6 4');
    expect(line).toContain('not an image: d6 5');
    expect(line).toContain('d4 (all)');
    expect(line).toMatch(/not given: [^.]*d6: 6\b/);
    expect(line).toContain('keys Atlas does not ask for, ignored: d6: 7');
  });

  it('a body whose faces() throws, rejects or answers no record paints Atlas numerals; the other bodies keep their art', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const art = await lookArt(look((body) => {
      if (body === 4) throw new Error('boom');
      if (body === 8) return Promise.reject(new Error('nope'));
      if (body === 10) return Promise.resolve(null as never);
      return Promise.resolve({ 1: source(16, 16) });
    }));
    expect(art.faces.get(4)!.size).toBe(0);
    expect(art.faces.get(8)!.size).toBe(0);
    expect(art.faces.get(10)!.size).toBe(0);
    expect(art.faces.get(20)!.size).toBe(1);
  });

  it('paints Atlas numerals on a body that misses its 10 s, and takes its art in when it still arrives', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let arrive: (set: FaceArtSet) => void = () => undefined;
    const registered = look((body) => (body === 12 ? new Promise<FaceArtSet>((resolve) => { arrive = resolve; }) : Promise.resolve({})));
    const late = vi.fn();
    const stop = onLateLookArt(late);
    const pending = lookArt(registered);
    await vi.advanceTimersByTimeAsync(LOOK_ART_TIMEOUT_MS + 1);
    const art = await pending;
    expect(art.faces.get(12)!.size).toBe(0);
    expect(String(warn.mock.calls[0]![0])).toContain('no answer within 10 s, painted once it arrives: d12');
    arrive({ 3: source(16, 16) });
    await vi.advanceTimersByTimeAsync(1);
    expect([...art.faces.get(12)!.keys()]).toEqual([3]);
    expect(late).toHaveBeenCalledWith(registered);
    stop();
  });

  it('takes relief art by the same keys', async () => {
    const art = await lookArt(look(async () => ({}), async (body) => (body === 20 ? { 20: source(16, 16) } : {})));
    expect([...art.bump.get(20)!.keys()]).toEqual([20]);
  });
});

describe('lookArt never rejects', () => {
  it('a record whose reads throw (a Proxy) leaves its faces out, and the art still resolves', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hostile = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('trap'); }, get: () => { throw new Error('trap'); } });
    const art = await lookArt(look(async () => hostile));
    expect(art.faces.get(6)!.size).toBe(0);
  });

  it('asks faces and relief together, so a slow relief does not delay the faces past their own 10 s', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = lookArt(look(async () => ({ 1: source(8, 8) }), () => new Promise<FaceArtSet>(() => undefined)));
    await vi.advanceTimersByTimeAsync(LOOK_ART_TIMEOUT_MS + 1);
    const art = await pending;
    expect(art.faces.get(6)!.size).toBe(1);
    expect(art.bump.get(6)!.size).toBe(0);
  });
});
