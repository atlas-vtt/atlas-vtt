import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Point } from '../../types/visionTypes';
import { NAMEPLATE_TEXT } from '../token-renderer/tokenSizing';
import { destroyTree } from '../utils/destroyTree';
import { createLucideIconTexture } from '../utils/lucideIconTexture';
import { drawLabelPill, labelColors, type MeasureLabel } from '../utils/measureLabel';

/** Inner markup of Lucide's `pin` icon. */
const PIN_SVG = [
  '<path d="M12 17v5"/>',
  '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
].join('');
/** Rasterised once in white and tinted, large enough for a zoomed-in map; mipmaps keep it clean when small. */
const PIN_TEXTURE_SIZE = 96;

/** The pin's look in the label's UI units. */
const PIN_LOOK = {
  /** Map between the label and the pin. */
  gap: 3,
  /** The glyph's size on its disc. */
  glyph: 9,
  /** How far beyond its disc a press still takes the pin. */
  reach: 2,
} as const;

/**
 * The pin beside the label of a measurement that fades: a round badge in the label's look, which a
 * click keeps the measurement with. It is drawn only; whoever owns the pointer asks `contains`.
 */
export class MeasurePin {
  readonly view = new Container({ label: 'measure-pin', eventMode: 'none', interactiveChildren: false });
  private readonly disc = new Graphics();
  private glyph: Sprite | null = null;
  private texture: Promise<Texture> | null = null;
  /** Where the pin takes a press, in world units; null until it is placed. */
  private area: { readonly x: number; readonly y: number; readonly radius: number } | null = null;

  constructor() {
    this.view.addChild(this.disc);
  }

  /** Puts the pin at the end of `label` as that is drawn now, at `zoom`. */
  place(label: MeasureLabel, zoom: number): void {
    const scale = label.view.scale.x;
    const { width, height } = label.pillSize;
    const x = label.view.position.x + (width / 2 + PIN_LOOK.gap + height / 2) * scale;
    const y = label.view.position.y;
    this.view.scale.set(scale);
    this.view.position.set(x, y);
    const colors = labelColors();
    drawLabelPill(this.disc, { width: height, height, radius: height / 2 }, colors, scale * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1));
    this.area = { x, y, radius: (height / 2 + PIN_LOOK.reach) * scale };
    this.showGlyph(colors.text);
  }

  /** Whether a press at the world point `point` is on the pin. */
  contains(point: Point): boolean {
    const area = this.area;
    return area !== null && this.view.visible && Math.hypot(point.x - area.x, point.y - area.y) <= area.radius;
  }

  destroy(): void {
    this.texture?.then((texture) => texture.destroy(true), () => undefined);
    this.texture = null;
    destroyTree(this.view);
  }

  /** The glyph in the label's ink; it joins the disc once its texture is there. */
  private showGlyph(ink: number): void {
    if (this.glyph) {
      this.glyph.tint = ink;
      return;
    }
    if (this.texture) return;
    this.texture = pinTexture();
    this.texture.then(
      (texture) => {
        if (this.view.destroyed) return;
        this.glyph = this.view.addChild(new Sprite({ texture, anchor: 0.5, tint: labelColors().text, alpha: NAMEPLATE_TEXT.alpha }));
        this.glyph.setSize(PIN_LOOK.glyph);
      },
      (error: unknown) => console.error('[MeasurePin] Failed to load the pin icon:', error),
    );
  }
}

async function pinTexture(): Promise<Texture> {
  const texture = await createLucideIconTexture(PIN_SVG, 'white', PIN_TEXTURE_SIZE);
  texture.source.autoGenerateMipmaps = true;
  texture.source.update();
  return texture;
}
