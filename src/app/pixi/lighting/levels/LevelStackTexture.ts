import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import { VIEWED, type LevelStack } from '../../../levels/levelStack';
import type { CompositeStack } from '../engine/compositeFilter';

/**
 * The level stack on the graphics card, for the composites to read and to erase the viewed
 * level's map with: one texel per stack texel over the stack's box, with a border of texels that
 * show the viewed level. Red is the level a texel shows; alpha is 1 where that is not the viewed
 * level. Read only texel by texel (`texelFetch`, `nearest`), never filtered, so the picture and the
 * rule read the same byte.
 *
 * `eraser` is a sprite of it in world space with `erase` blending: put between the map's grid and
 * the tokens, it takes away the map and the grid's backing wherever the view shows another level,
 * so what is left of the scene there is the viewed level's own tokens. The border keeps the edge
 * of the sprite's quad, whose pixels a multisampled canvas covers in part, clear of every hole.
 */
export class LevelStackTexture {
  readonly eraser = new Sprite({ texture: Texture.EMPTY, label: 'level-openings-eraser', eventMode: 'none' });
  private texture: Texture | null = null;
  private source: BufferImageSource | null = null;
  private stack: LevelStack | null = null;
  private bound: CompositeStack | null = null;

  constructor() {
    this.eraser.blendMode = 'erase';
    this.eraser.visible = false;
  }

  /** What the composites read: null while the stack shows only the viewed level. */
  get composite(): CompositeStack | null {
    return this.bound;
  }

  /**
   * Uploads `stack` and hands what the composites read to `bind` (null while the stack shows only
   * the viewed level). The same stack again does nothing. The texture is kept and filled anew:
   * destroying one a batch of the last render still holds makes PIXI warn, and openings come and
   * go as the GM draws them.
   */
  update(stack: LevelStack | null, bind: (composite: CompositeStack | null) => void): void {
    if (stack === this.stack) return;
    this.stack = stack;
    const box = stack?.box;
    if (!stack || !box) {
      this.bound = null;
      this.eraser.visible = false;
      bind(null);
      return;
    }
    const columns = box.columns + 2;
    const rows = box.rows + 2;
    const pixels = new Uint8Array(columns * rows * 4);
    for (let row = 0; row < box.rows; row++) {
      for (let column = 0; column < box.columns; column++) {
        const shown = stack.cells[row * box.columns + column]!;
        const at = ((row + 1) * columns + column + 1) * 4;
        pixels[at] = shown;
        pixels[at + 3] = shown === VIEWED ? 0 : 255;
      }
    }
    const texture = this.fill(pixels, columns, rows);
    const { texel } = stack.grid;
    this.eraser.texture = texture;
    this.eraser.position.set((box.x - 1) * texel, (box.y - 1) * texel);
    this.eraser.scale.set(texel);
    this.eraser.visible = true;
    this.bound = { texture, box: { x: box.x - 1, y: box.y - 1, columns, rows }, texel, columns: stack.grid.columns, rows: stack.grid.rows };
    bind(this.bound);
  }

  /**
   * A texture of `pixels`, `columns` × `rows`. Its source is made once and then filled and resized in
   * place; the texture around it is made anew, so its frame is the source's size, and the one before
   * goes without its source.
   */
  private fill(pixels: Uint8Array, columns: number, rows: number): Texture {
    let source = this.source;
    if (!source) {
      source = this.source = new BufferImageSource({ resource: pixels, width: columns, height: rows, format: 'rgba8unorm', scaleMode: 'nearest', alphaMode: 'premultiplied-alpha', autoGenerateMipmaps: false });
    } else {
      source.resource = pixels;
      if (source.pixelWidth !== columns || source.pixelHeight !== rows) source.resize(columns, rows, 1);
      source.update();
    }
    const previous = this.texture;
    this.texture = new Texture({ source });
    previous?.destroy(false);
    return this.texture;
  }

  /** Lets go of the texture: whoever read it has let go of it first. */
  destroy(): void {
    this.stack = null;
    this.bound = null;
    this.eraser.texture = Texture.EMPTY;
    this.texture?.destroy(false);
    this.texture = null;
    this.source?.destroy();
    this.source = null;
    this.eraser.destroy();
  }
}
