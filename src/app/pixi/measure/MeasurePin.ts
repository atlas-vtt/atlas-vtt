import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Point } from '../../types/visionTypes';
import { NAMEPLATE_TEXT } from '../token-renderer/tokenSizing';
import { destroyTree } from '../utils/destroyTree';
import { createLucideIconTexture } from '../utils/lucideIconTexture';
import { drawLabelPill, labelColors, type MeasureLabel } from '../utils/measureLabel';
import { FINGER_TARGET_RADIUS, fingerReaches } from '../utils/pointerReach';
import { canvasBadgeTheme } from '../utils/canvasBadgeColors';
import { ValueTransition } from '../utils/ValueTransition';
import { MOTION_NORMAL_MS, MOTION_SLOW_MS, prefersReducedMotion } from '../../utils/motion';

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
  /** Its size as a share of its own as it pops in beside the label. */
  popFrom: 0.5,
  /** How much larger it stands under the pointer. */
  lift: 0.14,
  /** The accent ring it takes under the pointer: screen pixels wide, and off the disc's rim. */
  ring: 1.5,
  ringGap: 1.5,
} as const;

/** `from` mixed towards `to` by `share`, channel by channel. */
function mixColour(from: number, to: number, share: number): number {
  const channel = (shift: number): number => Math.round(((from >> shift) & 0xff) * (1 - share) + ((to >> shift) & 0xff) * share);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The pin beside the label of a measurement that fades: a round badge in the label's look, which a
 * click keeps the measurement with. It pops in, and under the pointer it lifts, takes a ring in the
 * theme's accent and its glyph turns to the accent (`setHovered`). It is drawn only; whoever owns
 * the pointer asks `contains`.
 */
export class MeasurePin {
  readonly view = new Container({ label: 'measure-pin', eventMode: 'none', interactiveChildren: false });
  private readonly disc = new Graphics();
  private readonly ring = new Graphics();
  private glyph: Sprite | null = null;
  private texture: Promise<Texture> | null = null;
  /** Where the pin takes a press, in world units; null until it is placed. */
  private area: { readonly x: number; readonly y: number; readonly radius: number; readonly fingerRadius: number } | null = null;
  /** The label's scale it takes, before it pops in. */
  private size = 1;
  private readonly appear = new ValueTransition(1, MOTION_SLOW_MS, () => this.applyMotion());
  /** How far it is lifted by the pointer over it, 0 to 1. */
  private readonly lift = new ValueTransition(0, MOTION_NORMAL_MS, () => this.applyMotion());
  private ink = 0;
  private accent = 0;

  constructor() {
    this.ring.alpha = 0;
    this.view.addChild(this.ring, this.disc);
  }

  /** The pointer is over it, or left it: it lifts and takes the accent, or settles back. */
  setHovered(hovered: boolean): void {
    const target = hovered ? 1 : 0;
    if (this.lift.targetValue === target) return;
    if (prefersReducedMotion(document.body)) this.lift.jumpTo(target);
    else this.lift.animateTo(target);
  }

  /** Pops in where it was placed: it fades in as it grows to its size. */
  popIn(): void {
    this.lift.jumpTo(0);
    if (prefersReducedMotion(document.body)) {
      this.appear.jumpTo(1);
      return;
    }
    this.appear.jumpTo(0);
    this.appear.animateTo(1);
  }

  /** Puts the pin at the end of `label` as that is drawn now, at `zoom`. */
  place(label: MeasureLabel, zoom: number): void {
    const scale = label.view.scale.x;
    const { width, height } = label.pillSize;
    const x = label.view.position.x + (width / 2 + PIN_LOOK.gap + height / 2) * scale;
    const y = label.view.position.y;
    this.size = scale;
    this.view.position.set(x, y);
    const colors = labelColors();
    const viewZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    drawLabelPill(this.disc, { width: height, height, radius: height / 2 }, colors, scale * viewZoom);
    this.ink = colors.text;
    this.accent = canvasBadgeTheme().accent;
    const onScreen = scale * viewZoom;
    this.ring.clear().circle(0, 0, height / 2 + (PIN_LOOK.ringGap + PIN_LOOK.ring / 2) / onScreen).stroke({ width: PIN_LOOK.ring / onScreen, color: this.accent });
    this.applyMotion();
    const radius = (height / 2 + PIN_LOOK.reach) * scale;
    this.area = { x, y, radius, fingerRadius: Math.max(radius, FINGER_TARGET_RADIUS / viewZoom) };
    this.showGlyph();
  }

  /** Whether a press at the world point `point` is on the pin. */
  contains(point: Point): boolean {
    const area = this.area;
    return area !== null && this.view.visible && Math.hypot(point.x - area.x, point.y - area.y) <= (fingerReaches() ? area.fingerRadius : area.radius);
  }

  destroy(): void {
    this.appear.cancel();
    this.lift.cancel();
    this.texture?.then((texture) => texture.destroy(true), () => undefined);
    this.texture = null;
    destroyTree(this.view);
  }

  /** Its size, opacity, ring and glyph as it pops in (`appear`) and as the pointer lifts it (`lift`). */
  private applyMotion(): void {
    if (this.view.destroyed) return;
    const shown = this.appear.value;
    const lifted = this.lift.value;
    this.view.alpha = shown;
    this.view.scale.set(this.size * (PIN_LOOK.popFrom + (1 - PIN_LOOK.popFrom) * shown) * (1 + PIN_LOOK.lift * lifted));
    this.ring.alpha = lifted;
    if (this.glyph) this.glyph.tint = mixColour(this.ink, this.accent, lifted);
  }

  /** The glyph in the label's ink, or the accent as it lifts; it joins the disc once its texture is there. */
  private showGlyph(): void {
    if (this.glyph) {
      this.applyMotion();
      return;
    }
    if (this.texture) return;
    this.texture = pinTexture();
    this.texture.then(
      (texture) => {
        if (this.view.destroyed) return;
        this.glyph = this.view.addChild(new Sprite({ texture, anchor: 0.5, tint: labelColors().text, alpha: NAMEPLATE_TEXT.alpha }));
        this.glyph.setSize(PIN_LOOK.glyph);
        this.applyMotion();
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
