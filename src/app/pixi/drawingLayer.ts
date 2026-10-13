import { Graphics, Sprite, type Container, type Texture } from 'pixi.js';
import type { DrawingStroke } from '../types';
import { MAP_ICON_SVG } from './mapIcons';
import { createLucideIconTexture } from './utils/lucideIconTexture';

/** Draws a pen stroke: a dot for a single point, else a round-capped line through the points. */
export function drawStroke(
  graphics: Graphics,
  points: ReadonlyArray<{ x: number; y: number }>,
  color: string,
  width: number,
  opacity: number,
): void {
  graphics.clear();
  const first = points[0];
  if (!first) return;

  if (points.length === 1) {
    graphics.circle(first.x, first.y, width / 2).fill({ color, alpha: opacity });
    return;
  }

  graphics.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.stroke({ color, width, alpha: opacity, cap: 'round', join: 'round' });
}

/**
 * The stored drawings of a map in a container: one display object per pen stroke or icon
 * stamp, reused while its record is unchanged.
 */
export class DrawingLayer {
  private readonly nodes = new Map<string, Container>();
  /** Stroke each node was last drawn from; a new reference means it moved or was restored by undo. */
  private readonly rendered = new Map<string, DrawingStroke>();
  private readonly iconTextures = new Map<string, Texture>();

  constructor(private readonly container: Container) {}

  /** Shows exactly `drawings`: new ones are drawn, changed ones redrawn, the rest removed. */
  sync(drawings: Readonly<Record<string, DrawingStroke>>): void {
    for (const [id, node] of this.nodes) {
      if (!drawings[id]) {
        node.destroy();
        this.nodes.delete(id);
        this.rendered.delete(id);
      }
    }

    for (const stroke of Object.values(drawings)) {
      const previous = this.rendered.get(stroke.id);
      if (previous === stroke) continue;
      this.rendered.set(stroke.id, stroke);

      let existing = this.nodes.get(stroke.id);
      if (stroke.type === 'icon') {
        // A restyled stamp needs a new texture; a moved one only a new position
        if (existing && (previous?.icon !== stroke.icon || previous?.color !== stroke.color)) {
          existing.destroy();
          this.nodes.delete(stroke.id);
          existing = undefined;
        }
        const center = stroke.points[0];
        if (existing && center) existing.position.set(center.x, center.y);
        else if (!existing) this.addIconNode(stroke);
        continue;
      }

      let graphics = existing as Graphics | undefined;
      if (!graphics) {
        graphics = new Graphics();
        graphics.eventMode = 'none';
        this.container.addChild(graphics);
        this.nodes.set(stroke.id, graphics);
      }
      drawStroke(graphics, stroke.points, stroke.color, stroke.width, stroke.opacity);
    }
  }

  /** Forgets every node and frees the icon textures; the container is its owner's to destroy. */
  destroy(): void {
    this.nodes.clear();
    this.rendered.clear();
    for (const texture of this.iconTextures.values()) texture.destroy(true);
    this.iconTextures.clear();
  }

  /** Place an icon stamp; its texture is rasterised (and cached) on demand. */
  private addIconNode(stroke: DrawingStroke): void {
    const center = stroke.points[0];
    const markup = stroke.icon ? MAP_ICON_SVG[stroke.icon] : undefined;
    if (!center || !markup) return;

    const sprite = new Sprite();
    sprite.eventMode = 'none';
    sprite.anchor.set(0.5);
    sprite.position.set(center.x, center.y);
    sprite.width = stroke.width;
    sprite.height = stroke.width;
    sprite.alpha = stroke.opacity;
    this.container.addChild(sprite);
    this.nodes.set(stroke.id, sprite);

    const cacheKey = `${stroke.icon}-${stroke.color}`;
    const cached = this.iconTextures.get(cacheKey);
    if (cached) {
      sprite.texture = cached;
      return;
    }

    createLucideIconTexture(markup, stroke.color, 96)
      .then((texture) => {
        this.iconTextures.set(cacheKey, texture);
        if (sprite.destroyed) return;
        sprite.texture = texture;
        sprite.width = stroke.width;
        sprite.height = stroke.width;
      })
      .catch((err) => console.error('[DrawingLayer] Failed to rasterise icon:', err));
  }
}
