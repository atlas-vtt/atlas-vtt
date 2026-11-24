import type { Renderer } from 'pixi.js';
import { ExploredTexture } from '../../../pixi/lighting/ExploredTexture';
import type { ExploredShapes } from '../../../vision/exploredShapes';
import type { MapBounds } from '../../../vision/visibility';
import { toBase64 } from '../assetServe.ts';
import { field } from '../atlasLighting.ts';
import { call } from '../atlasView.ts';
import type { MemoryPng, MemoryRaster, MemoryRasters } from './memoryPorts.ts';

const dataUrl = (png: MemoryPng): string => `data:image/png;base64,${toBase64(png)}`;

/** A canvas as PNG bytes, encoded off the main thread; null where it cannot be. */
function canvasPng(canvas: HTMLCanvasElement): Promise<MemoryPng | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob === null) return resolve(null);
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), () => resolve(null));
    }, 'image/png');
  });
}

/** Where a texture stands: made in a context that is still the one it was made in, or blanked since. */
interface Device {
  readonly renderer: Renderer;
  /** Bumped by every lost context: a texture made before it is blank. */
  readonly generation: number;
  readonly lost: boolean;
}

/**
 * One player's memory as an `ExploredTexture` on the GM's renderer. A lost graphics context blanks it:
 * until the context is back it is read back as nothing, and then it is made anew from the memory it last
 * read back or took in, with what it was given meanwhile.
 */
class TextureRaster implements MemoryRaster {
  private texture: ExploredTexture | null = null;
  private generation = -1;
  /** The memory last read back or taken in, which a texture made anew starts from. */
  private kept: MemoryPng | null = null;
  /** Memories taken in while the texture could not be drawn on. */
  private waiting: MemoryPng[] = [];
  /** The memories a texture made anew is being given back: it is not read back before. */
  private restoring: Promise<void> = Promise.resolve();

  constructor(private readonly device: () => Device, private readonly bounds: MapBounds) {}

  add(shapes: ExploredShapes): void {
    this.current()?.add(shapes);
  }

  async merge(png: MemoryPng): Promise<void> {
    const texture = this.current();
    if (texture === null) return void this.waiting.push(png);
    await this.drawOver(texture, png);
  }

  async replace(png: MemoryPng | null): Promise<void> {
    this.kept = png;
    this.waiting = [];
    const texture = this.current();
    if (texture === null) return;
    await this.restoring;
    if (png === null) texture.clear();
    else {
      const image = await texture.decode(dataUrl(png));
      if (this.texture === texture) texture.draw(image);
      else image.destroy(true);
    }
  }

  async encode(): Promise<MemoryPng | null> {
    const texture = this.current();
    if (texture === null) return null;
    await this.restoring;
    const generation = this.generation;
    if (this.texture !== texture || generation !== this.device().generation) return null;
    const png = await canvasPng(texture.toCanvas());
    if (png !== null) this.kept = png;
    return png;
  }

  destroy(): void {
    this.texture?.destroy();
    this.texture = null;
  }

  private async drawOver(texture: ExploredTexture, png: MemoryPng): Promise<void> {
    const image = await texture.decode(dataUrl(png));
    if (this.texture === texture) texture.drawOver(image);
    else image.destroy(true);
  }

  /** The texture, made anew where a lost context blanked it; null while the context is lost. */
  private current(): ExploredTexture | null {
    const device = this.device();
    if (device.lost) return null;
    if (this.texture !== null && this.generation === device.generation) return this.texture;
    this.texture?.destroy();
    const texture = new ExploredTexture(device.renderer, this.bounds);
    this.texture = texture;
    this.generation = device.generation;
    const restore = [...(this.kept === null ? [] : [this.kept]), ...this.waiting];
    this.waiting = [];
    this.restoring = Promise.all(restore.map((png) => this.drawOver(texture, png))).then(() => undefined, () => undefined);
    return texture;
  }
}

/** The PIXI renderer of an Atlas tab's renderer (`getAppInstance().renderer`), or null where it has none. */
export function pixiRendererOf(tabRenderer: unknown): Renderer | null {
  const renderer = field(call(tabRenderer, 'getAppInstance'), 'renderer');
  const canvas = field(renderer, 'canvas');
  return typeof field(renderer, 'render') === 'function' && typeof field(canvas, 'addEventListener') === 'function' ? (renderer as Renderer) : null;
}

/**
 * Players' memory textures on the renderer of the GM's tab, found anew at each texture made (null while
 * the tab has none). It follows the renderer's canvas for lost contexts; `dispose` stops that.
 */
export class TextureRasters implements MemoryRasters {
  private bound: Renderer | null = null;
  private generation = 0;
  private lost = false;
  private readonly onLost = (): void => {
    this.lost = true;
    this.generation++;
  };
  private readonly onRestored = (): void => {
    this.lost = false;
  };

  constructor(private readonly renderer: () => Renderer | null) {}

  create(bounds: MapBounds): MemoryRaster | null {
    const renderer = this.renderer();
    if (renderer === null) return null;
    if (renderer !== this.bound) this.bind(renderer);
    return new TextureRaster(() => ({ renderer, generation: this.generation, lost: this.lost }), bounds);
  }

  dispose(): void {
    this.bound?.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.bound?.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.bound = null;
  }

  private bind(renderer: Renderer): void {
    this.dispose();
    this.bound = renderer;
    this.generation++;
    renderer.canvas.addEventListener('webglcontextlost', this.onLost);
    renderer.canvas.addEventListener('webglcontextrestored', this.onRestored);
  }
}
