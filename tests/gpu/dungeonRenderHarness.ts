import { commands } from 'vitest/browser';

/** Where rendered pictures go, under the project root (the browser may write nowhere else). */
export const RENDER_OUT = 'out/dungeon-render';

/**
 * `ctx` with every text call recorded instead of drawn, so a test can hold that a map carries no
 * text at all.
 */
export function withoutText<T extends object>(ctx: T): { ctx: T; texts: string[] } {
  const texts: string[] = [];
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key === 'fillText' || key === 'strokeText') return (text: unknown) => { texts.push(String(text)); };
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  return { ctx: proxy, texts };
}

/** The most pixels a picture is written with; larger ones are written reduced, as the browser can hand over only so much. */
const SAVED_PIXELS = 16_000_000;

export async function savePng(canvas: OffscreenCanvas, name: string): Promise<void> {
  const k = Math.min(1, Math.sqrt(SAVED_PIXELS / (canvas.width * canvas.height)));
  let saved = canvas;
  if (k < 1) {
    saved = new OffscreenCanvas(Math.round(canvas.width * k), Math.round(canvas.height * k));
    const ctx = saved.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, saved.width, saved.height);
  }
  const blob = await saved.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`${RENDER_OUT}/${name}.png`, btoa(binary), 'base64');
}

export interface PixelStats {
  /** Share of pixels close to the ink colour. */
  ink: number;
  /** Distinct colours, coarsely binned. */
  colours: number;
  transparent: number;
}

export function pixelStats(canvas: OffscreenCanvas, ink: [number, number, number]): PixelStats {
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let inkCount = 0;
  let transparent = 0;
  const bins = new Set<number>();
  const total = data.length / 4;
  const stride = Math.max(1, Math.floor(total / 400_000));
  let sampled = 0;
  for (let i = 0; i < total; i += stride) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    const a = data[i * 4 + 3]!;
    sampled++;
    if (a < 8) transparent++;
    if (Math.abs(r - ink[0]) + Math.abs(g - ink[1]) + Math.abs(b - ink[2]) < 60 && a > 200) inkCount++;
    bins.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  return { ink: inkCount / sampled, colours: bins.size, transparent: transparent / sampled };
}
