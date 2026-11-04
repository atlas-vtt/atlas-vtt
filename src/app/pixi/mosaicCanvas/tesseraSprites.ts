/** The sprites of a map image layer: one per tessera any view draws, faded in once, shown per picture. */
import { Sprite, type Container, type Texture } from 'pixi.js';
import { MOTION_NORMAL_MS } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { tesseraContentRect, tesseraKey, type Pyramid, type TesseraRef } from './pyramid';

export interface TesseraSpritesOptions {
  pyramid: Pyramid;
  /** One container per level, scaled to world units; a tessera's sprite goes into its level's. */
  levels: readonly Container[];
  /** The tessera's texture once it is uploaded; null before. */
  texture: (ref: TesseraRef) => Texture | null;
  requestRender: () => void;
  /** Read when a tessera appears: true draws it at once instead of fading it in. */
  drawAtOnce?: () => boolean;
  /** A tessera finished fading in. */
  onOpaque: () => void;
}

interface TesseraSprite {
  ref: TesseraRef;
  sprite: Sprite;
  fade: ValueTransition | null;
}

export class TesseraSprites {
  private readonly sprites = new Map<string, TesseraSprite>();
  private readonly opaque = new Set<string>();
  /** What the canvas shows: the GM camera's tesserae. */
  private shown = new Set<string>();

  constructor(private readonly options: TesseraSpritesOptions) {}

  /** Tesserae drawn at full alpha, their fade finished. */
  get opaqueKeys(): ReadonlySet<string> {
    return this.opaque;
  }

  opaqueTesserae(): TesseraRef[] {
    return [...this.opaque].map(key => this.sprites.get(key)!.ref);
  }

  /**
   * Gives every tessera of `draw` a sprite (fading in), releases the sprites of tesserae neither drawn nor
   * kept, and shows on the canvas only the tesserae of `shown`.
   */
  sync(draw: Iterable<TesseraRef>, keep: ReadonlySet<string>, shown: ReadonlySet<string>): void {
    this.shown = new Set(shown);
    let changed = false;
    const drawn = new Map([...draw].map(ref => [tesseraKey(ref), ref]));
    for (const [key, tessera] of this.sprites) {
      if (keep.has(key) || drawn.has(key)) continue;
      this.release(key, tessera);
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
   * Shows exactly the tesserae of `draw`, with a sprite of its own at full alpha for each that has none
   * yet, until the returned function puts the canvas' picture back. For one render of another picture.
   */
  drawOnly(draw: readonly TesseraRef[]): () => void {
    const extra: Sprite[] = [];
    for (const ref of draw) {
      if (this.sprites.has(tesseraKey(ref))) continue;
      const sprite = this.spriteOf(ref);
      if (sprite) extra.push(sprite);
    }
    this.showOnly(new Set(draw.map(tesseraKey)));
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
    for (const tessera of this.sprites.values()) tessera.fade?.cancel();
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

  private add(ref: TesseraRef): boolean {
    const sprite = this.spriteOf(ref);
    if (!sprite) return false;
    const key = tesseraKey(ref);
    const tessera: TesseraSprite = { ref, sprite, fade: null };
    this.sprites.set(key, tessera);
    if (this.options.drawAtOnce?.()) {
      this.opaque.add(key);
      this.options.onOpaque();
      return true;
    }
    sprite.alpha = 0;
    tessera.fade = new ValueTransition(0, MOTION_NORMAL_MS, (alpha) => {
      sprite.alpha = alpha;
      this.options.requestRender();
    });
    tessera.fade.animateTo(1, () => {
      tessera.fade = null;
      this.opaque.add(key);
      this.options.onOpaque();
    });
    return true;
  }

  private spriteOf(ref: TesseraRef): Sprite | null {
    const texture = this.options.texture(ref);
    const level = this.options.levels[ref.level];
    if (!texture || !level) return null;
    const content = tesseraContentRect(this.options.pyramid, ref);
    const sprite = new Sprite({ texture, x: content.x, y: content.y, label: tesseraKey(ref) });
    sprite.eventMode = 'none';
    level.addChild(sprite);
    return sprite;
  }

  private release(key: string, tessera: TesseraSprite): void {
    tessera.fade?.cancel();
    destroyTree(tessera.sprite);
    this.sprites.delete(key);
    this.opaque.delete(key);
  }
}
