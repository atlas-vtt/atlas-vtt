import { Sprite, Texture, type Graphics } from 'pixi.js';
import type { DrawingAnnotation } from '../annotations/annotationTypes';
import { drawingInk, type DrawingInk } from '../annotations/drawingInk';
import type { FilledPart } from '../annotations/quantized';
import type { Point } from '../types/visionTypes';
import { MAP_ICON_SVG } from './mapIcons';
import { createLucideIconTexture } from './utils/lucideIconTexture';

/** The side a stamp's symbol is rasterised at, pixels. */
const STAMP_TEXTURE_SIDE = 96;

const flat = (ring: readonly Point[]): number[] => ring.flatMap(({ x, y }) => [x, y]);

/**
 * Fills `parts` in one tone. Areas without holes share one fill; an area with holes is a fill of
 * its own, since a fill's holes are cut out of every area it has.
 */
function fillParts(graphics: Graphics, parts: readonly FilledPart[], color: string, alpha: number): void {
  let plain = false;
  for (const { outline, holes } of parts) {
    if (outline.length < 3 || holes.length > 0) continue;
    graphics.poly(flat(outline), true);
    plain = true;
  }
  if (plain) graphics.fill({ color, alpha });
  for (const { outline, holes } of parts) {
    if (outline.length < 3 || holes.length === 0) continue;
    graphics.poly(flat(outline), true).fill({ color, alpha });
    for (const hole of holes) {
      if (hole.length >= 3) graphics.poly(flat(hole), true).cut();
    }
  }
}

/** Draws `ink` in `color` into `graphics`, after what it already holds: the fill, then the line over it. */
export function paintInk(graphics: Graphics, ink: DrawingInk, color: string): void {
  const { width, alpha } = ink;
  if (ink.fill) fillParts(graphics, ink.fill.parts, color, ink.fill.alpha);
  if (ink.even) {
    fillParts(graphics, ink.even, color, alpha);
    return;
  }
  let stroked = false;
  let dotted = false;
  for (const line of ink.lines) {
    const first = line[0];
    if (!first || line.length === 1) continue;
    graphics.moveTo(first.x, first.y);
    for (let i = 1; i < line.length; i++) graphics.lineTo(line[i]!.x, line[i]!.y);
    stroked = true;
  }
  if (stroked) graphics.stroke({ color, width, alpha, cap: 'round', join: 'round' });
  for (const line of ink.lines) {
    const only = line[0];
    if (!only || line.length !== 1) continue;
    graphics.circle(only.x, only.y, width / 2);
    dotted = true;
  }
  if (dotted) graphics.fill({ color, alpha });
  if (ink.heads.length === 0) return;
  for (const head of ink.heads) graphics.poly(flat(head), true);
  graphics.fill({ color, alpha });
}

/**
 * Draws `drawing` (no stamp) into `graphics`, in place of what it held. `tolerance` is how far
 * its curve may round the corners of its points (`curveTolerance`).
 */
export function paintDrawing(graphics: Graphics, drawing: DrawingAnnotation, tolerance: number): void {
  graphics.clear();
  paintInk(graphics, drawingInk(drawing, tolerance), drawing.color);
}

/** The symbols of stamps as textures, one for each symbol and colour, rasterised when first asked for. */
export class StampTextures {
  private readonly textures = new Map<string, Texture>();
  private readonly pending = new Map<string, Promise<Texture | null>>();
  private destroyed = false;

  /** The texture of `icon` in `color` once it is there; null for a symbol the catalogue does not know, or one that cannot be drawn. */
  of(icon: string, color: string): Texture | Promise<Texture | null> | null {
    const markup = MAP_ICON_SVG[icon];
    if (!markup) return null;
    const key = `${icon}-${color}`;
    const known = this.textures.get(key);
    if (known) return known;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = createLucideIconTexture(markup, color, STAMP_TEXTURE_SIDE).then((texture) => {
        this.pending.delete(key);
        if (this.destroyed) {
          texture.destroy(true);
          return null;
        }
        this.textures.set(key, texture);
        return texture;
      }).catch((error: unknown) => {
        this.pending.delete(key);
        console.error('[StampTextures] Failed to rasterise a symbol:', error);
        return null;
      });
      this.pending.set(key, pending);
    }
    return pending;
  }

  destroy(): void {
    this.destroyed = true;
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
  }
}

/** What a stamp's sprite shows: another symbol or colour is another texture, and a texture that comes in late takes the width asked for last. */
const shown = new WeakMap<Sprite, { icon: string; color: string; width: number }>();

/** A sprite for stamps: empty until `placeStamp` draws one into it. */
export function createStampSprite(): Sprite {
  const sprite = new Sprite(Texture.EMPTY);
  sprite.eventMode = 'none';
  sprite.anchor.set(0.5);
  return sprite;
}

function sized(sprite: Sprite, width: number): void {
  sprite.width = width;
  sprite.height = width;
}

/**
 * Shows `stamp` in `sprite`: its symbol in its colour, as wide as its footprint, about its
 * centre, turned and as see-through as it is. `changed` is called once a symbol that was still
 * being rasterised is in, since nothing else tells that the picture is another.
 */
export function placeStamp(sprite: Sprite, stamp: DrawingAnnotation, textures: StampTextures, changed?: () => void): void {
  const centre = stamp.points[0]!;
  const icon = stamp.icon ?? '';
  sprite.position.set(centre.x, centre.y);
  sprite.rotation = (stamp.rotation * Math.PI) / 180;
  sprite.alpha = stamp.opacity;
  sized(sprite, stamp.width);
  const before = shown.get(sprite);
  if (before?.icon === icon && before.color === stamp.color) {
    before.width = stamp.width;
    return;
  }
  const wanted = { icon, color: stamp.color, width: stamp.width };
  shown.set(sprite, wanted);
  const texture = textures.of(icon, stamp.color);
  if (texture instanceof Texture || texture === null) {
    sprite.texture = texture ?? Texture.EMPTY;
    sized(sprite, stamp.width);
    return;
  }
  void texture.then((ready) => {
    // The sprite may be gone by now, or show another stamp.
    if (sprite.destroyed || shown.get(sprite) !== wanted) return;
    sprite.texture = ready ?? Texture.EMPTY;
    sized(sprite, wanted.width);
    changed?.();
  });
}
