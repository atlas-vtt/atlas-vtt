/** The sprites of a map image layer: one per tile any view draws, faded in once, shown per picture. */
import { Sprite, type Container, type Texture } from 'pixi.js';
import { MOTION_NORMAL_MS } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { tileContentRect, tileKey, type Pyramid, type TileRef } from './pyramid';

export interface TileSpritesOptions {
  pyramid: Pyramid;
  /** One container per level, scaled to world units; a tile's sprite goes into its level's. */
  levels: readonly Container[];
  /** The tile's texture once it is uploaded; null before. */
  texture: (ref: TileRef) => Texture | null;
  requestRender: () => void;
  /** Read when a tile appears: true draws it at once instead of fading it in. */
  drawAtOnce?: () => boolean;
  /** A tile finished fading in. */
  onOpaque: () => void;
}

interface TileSprite {
  ref: TileRef;
  sprite: Sprite;
  fade: ValueTransition | null;
}

export class TileSprites {
  private readonly sprites = new Map<string, TileSprite>();
  private readonly opaque = new Set<string>();
  /** What the canvas shows: the GM camera's tiles. */
  private shown = new Set<string>();

  constructor(private readonly options: TileSpritesOptions) {}

  /** Tiles drawn at full alpha, their fade finished. */
  get opaqueKeys(): ReadonlySet<string> {
    return this.opaque;
  }

  opaqueTiles(): TileRef[] {
    return [...this.opaque].map(key => this.sprites.get(key)!.ref);
  }

  /**
   * Gives every tile of `draw` a sprite (fading in), releases the sprites of tiles neither drawn nor
   * kept, and shows on the canvas only the tiles of `shown`.
   */
  sync(draw: Iterable<TileRef>, keep: ReadonlySet<string>, shown: ReadonlySet<string>): void {
    this.shown = new Set(shown);
    let changed = false;
    const drawn = new Map([...draw].map(ref => [tileKey(ref), ref]));
    for (const [key, tile] of this.sprites) {
      if (keep.has(key) || drawn.has(key)) continue;
      this.release(key, tile);
      changed = true;
    }
    for (const [key, ref] of drawn) {
      if (this.sprites.has(key)) continue;
      if (this.add(ref)) changed = true;
    }
    if (this.showOnly(this.shown)) changed = true;
    if (changed) this.options.requestRender();
  }

  /**
   * Shows exactly the tiles of `draw`, with a sprite of its own at full alpha for each that has none
   * yet, until the returned function puts the canvas' picture back. For one render of another picture.
   */
  drawOnly(draw: readonly TileRef[]): () => void {
    const extra: Sprite[] = [];
    for (const ref of draw) {
      if (this.sprites.has(tileKey(ref))) continue;
      const sprite = this.spriteOf(ref);
      if (sprite) extra.push(sprite);
    }
    this.showOnly(new Set(draw.map(tileKey)));
    return (): void => {
      for (const sprite of extra) destroyTree(sprite);
      this.showOnly(this.shown);
    };
  }

  /** Whether `key` is drawn by no fade under way: as a picture of it would show it at once. */
  isSettled(key: string): boolean {
    return !this.sprites.get(key)?.fade;
  }

  destroy(): void {
    for (const tile of this.sprites.values()) tile.fade?.cancel();
    this.sprites.clear();
    this.opaque.clear();
  }

  /** Sets each sprite's `visible` to whether `keys` holds it; true when any changed. */
  private showOnly(keys: ReadonlySet<string>): boolean {
    let changed = false;
    for (const [key, { sprite }] of this.sprites) {
      const visible = keys.has(key);
      if (sprite.visible === visible) continue;
      sprite.visible = visible;
      changed = true;
    }
    return changed;
  }

  private add(ref: TileRef): boolean {
    const sprite = this.spriteOf(ref);
    if (!sprite) return false;
    const key = tileKey(ref);
    const tile: TileSprite = { ref, sprite, fade: null };
    this.sprites.set(key, tile);
    if (this.options.drawAtOnce?.()) {
      this.opaque.add(key);
      this.options.onOpaque();
      return true;
    }
    sprite.alpha = 0;
    tile.fade = new ValueTransition(0, MOTION_NORMAL_MS, (alpha) => {
      sprite.alpha = alpha;
      this.options.requestRender();
    });
    tile.fade.animateTo(1, () => {
      tile.fade = null;
      this.opaque.add(key);
      this.options.onOpaque();
    });
    return true;
  }

  private spriteOf(ref: TileRef): Sprite | null {
    const texture = this.options.texture(ref);
    const level = this.options.levels[ref.level];
    if (!texture || !level) return null;
    const content = tileContentRect(this.options.pyramid, ref);
    const sprite = new Sprite({ texture, x: content.x, y: content.y, label: tileKey(ref) });
    sprite.eventMode = 'none';
    level.addChild(sprite);
    return sprite;
  }

  private release(key: string, tile: TileSprite): void {
    tile.fade?.cancel();
    destroyTree(tile.sprite);
    this.sprites.delete(key);
    this.opaque.delete(key);
  }
}
