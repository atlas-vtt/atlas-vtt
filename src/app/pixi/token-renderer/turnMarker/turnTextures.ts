import { BufferImageSource, Texture } from 'pixi.js';
import { poolTexel } from './turnMarkerShape';

/** Texels across the pool: it is a smooth falloff, which a huge token zoomed far in still shows without steps. */
const POOL_SIZE = 512;
/** Texels across the disc a framed token's pool is kept off by: an edge one texel soft at any size it is drawn. */
const DISC_SIZE = 256;

/** A small fixed noise per texel, under half a step of 8 bits, so the soft falloff shows no bands. */
function dither(x: number, y: number): number {
  const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return hash - Math.floor(hash) - 0.5;
}

const byte = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

/** Fills a `size` texel square with `texel(share, x, y)` of each texel's distance from the middle as a share of the radius. */
function paint(size: number, texel: (share: number, x: number, y: number) => readonly [number, number]): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [light, alpha] = texel(Math.hypot(x + 0.5 - half, y + 0.5 - half) / half, x, y);
      if (alpha <= 0 && light <= 0) continue;
      const offset = 4 * (y * size + x);
      data[offset] = light;
      data[offset + 1] = light;
      data[offset + 2] = light;
      data[offset + 3] = alpha;
    }
  }
  return data;
}

function texture(data: Uint8Array, size: number, label: string): Texture {
  // Premultiplied as it is: the pool's colour may exceed its alpha, which is the light it adds
  return new Texture({ source: new BufferImageSource({
    resource: data, width: size, height: size, format: 'rgba8unorm', alphaMode: 'premultiplied-alpha', autoGenerateMipmaps: true, scaleMode: 'linear', label,
  }) });
}

/** The pool in white (tinted gold per marker), with mipmaps for a map zoomed out. */
export function paintPool(size = POOL_SIZE): Texture {
  return texture(paint(size, (share, x, y) => {
    if (share >= 1) return [0, 0];
    const { alpha, light } = poolTexel(share);
    const noise = dither(x, y);
    return [byte(light * 255 + noise), byte(alpha * 255 + noise)];
  }), size, 'turnPool');
}

/** A white disc filling its texture, edge antialiased: the shape of a framed token, which its art and ring fill. */
export function paintDisc(size = DISC_SIZE): Texture {
  const half = size / 2;
  return texture(paint(size, (share) => {
    const cover = byte(Math.min(1, Math.max(0, (1 - share) * half + 0.5)) * 255);
    return [cover, cover];
  }), size, 'turnDisc');
}

/** The textures every marker of a view shares, made with the first marker and kept until the view goes. */
export class TurnTextures {
  private made: { pool: Texture; disc: Texture } | null = null;

  get pool(): Texture {
    return this.textures().pool;
  }

  get disc(): Texture {
    return this.textures().disc;
  }

  destroy(): void {
    this.made?.pool.destroy(true);
    this.made?.disc.destroy(true);
    this.made = null;
  }

  private textures(): { pool: Texture; disc: Texture } {
    this.made ??= { pool: paintPool(), disc: paintDisc() };
    return this.made;
  }
}
