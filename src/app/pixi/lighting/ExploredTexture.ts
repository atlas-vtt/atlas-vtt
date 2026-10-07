import { Container, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { getDomHost } from '../../host/dom';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { MapBounds } from '../../vision/visibility';
import { destroyTree } from '../utils/destroyTree';
import { StampScratch, stampRegion, tilesOf } from './StampScratch';
import type { TexelRegion } from './StampScratch';

/** Longest side of the explored memory in texels; it is drawn dim and soft, so this is plenty. */
const MAX_TEXELS = 2048;

/**
 * A smaller image of the memory at the memory's size, with its edges where they were: scaled up
 * its coverage is spread over a texel or two, and only what is more than half covered is kept
 * (none up to a half, all from three quarters).
 */
function sharpened(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = getDomHost().createCanvas(undefined, { width, height });
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = Math.min(255, Math.max(0, 4 * pixels.data[i]! - 510));
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * What the viewer's tokens have seen so far, in a world-space texture over the map: red is 1
 * where a token has seen. It only grows until reset. Shapes that must stay inside the line of
 * sight are drawn through a mask of it.
 *
 * The texture is a plain 8-bit target. Each stamp is drawn anti-aliased, one tile at a time,
 * into a fixed scratch target (`StampScratch`) and merged in with `max`, so edges are smooth
 * and multisampling costs the same whatever the map's size.
 */
export class ExploredTexture {
  readonly texture: RenderTexture;
  private readonly scale: number;
  private readonly scratch: StampScratch;
  private readonly merge = new Container();
  private readonly mergeSprite = new Sprite();

  constructor(private readonly renderer: Renderer, bounds: MapBounds) {
    this.scale = Math.min(1, MAX_TEXELS / Math.max(bounds.width, bounds.height, 1));
    this.texture = RenderTexture.create({
      width: Math.max(1, Math.ceil(bounds.width * this.scale)),
      height: Math.max(1, Math.ceil(bounds.height * this.scale)),
    });
    this.scratch = new StampScratch(renderer);
    this.mergeSprite.blendMode = 'max';
    this.merge.addChild(this.mergeSprite);
    this.clear();
  }

  /** Stamps `shapes` in; `level` (0..1) is what a fully covered texel then holds at least: 1 for the memory itself. */
  add(shapes: ExploredShapes, level = 1): void {
    const region = stampRegion(shapes, this.scale, this.texture);
    if (!region) return;
    this.mergeSprite.alpha = level;
    this.scratch.begin(shapes);
    for (const tile of tilesOf(region)) {
      this.mergeSprite.texture = this.scratch.renderTile(this.scale, tile.x, tile.y);
      this.mergeSprite.position.set(tile.x, tile.y);
      this.renderer.render({ container: this.merge, target: this.texture, clear: false });
    }
  }

  clear(): void {
    this.renderer.render({ container: new Container(), target: this.texture, clear: true, clearColor: [0, 0, 0, 0] });
  }

  /**
   * Decodes a saved image of the memory; the caller draws it with `draw`, or destroys it if it
   * came too late. A mask of the memory's own size is the memory, texel for texel. Older
   * versions saved it at half that size at most: drawn back, such a mask spreads its edges past
   * the walls they ended at, so it is sharpened once, here (`sharpened`); the next save keeps it
   * at full size.
   */
  async decode(dataUrl: string): Promise<Texture> {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const { width, height } = this.texture;
    return Texture.from(image.naturalWidth < width || image.naturalHeight < height ? sharpened(image, width, height) : image);
  }

  /** Replaces the memory with a decoded image of it, which it then destroys with its source. */
  draw(image: Texture): void {
    const sprite = new Sprite(image);
    sprite.width = this.texture.width;
    sprite.height = this.texture.height;
    this.renderer.render({ container: sprite, target: this.texture, clear: true, clearColor: [0, 0, 0, 0] });
    destroyTree(sprite);
    // The source is the decoded image and its upload, as large as the memory itself; a texture
    // destroyed without it leaves both behind for every scene loaded.
    image.destroy(true);
  }

  /** Replaces the memory with a saved image of it. */
  async load(dataUrl: string): Promise<void> {
    this.draw(await this.decode(dataUrl));
  }

  /**
   * The memory as a canvas, for saving: white, with the coverage as alpha. The texture holds
   * premultiplied white, which a canvas or PNG would premultiply again on loading and so
   * halve every soft edge with each save.
   */
  toCanvas(): HTMLCanvasElement {
    const { pixels, width, height } = this.renderer.extract.pixels({ target: this.texture });
    const image = new ImageData(width, height);
    for (let i = 0; i < pixels.length; i += 4) {
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = pixels[i]!;
    }
    const canvas = getDomHost().createCanvas(undefined, { width, height });
    canvas.getContext('2d')?.putImageData(image, 0, 0);
    return canvas;
  }

  /**
   * Takes the memory away where `shapes` lie, with the smooth edges `add` draws: an edit by the
   * GM's hand (`ExploredMemory.edit`). Sight itself only ever adds. A texel on the edge loses the
   * share of it the shapes cover, so erasing exactly what was added leaves a trace on the edge
   * (at most a quarter of a texel's coverage); an undo step puts the texels back instead.
   */
  erase(shapes: ExploredShapes): void {
    this.mergeSprite.blendMode = 'erase';
    try {
      this.add(shapes);
    } finally {
      this.mergeSprite.blendMode = 'max';
    }
  }

  /** The texels `add` or `erase` would touch for `shapes`, or null when they lie outside the map. */
  regionOf(shapes: ExploredShapes): TexelRegion | null {
    return stampRegion(shapes, this.scale, this.texture);
  }

  destroy(): void {
    this.scratch.destroy();
    destroyTree(this.merge);
    this.texture.destroy(true);
  }
}
