import { BufferImageSource, Container, Graphics, Matrix, Mesh, MeshGeometry, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import type { TexelMask } from '../../levels/stackClip';
import type { ExploredShapes } from '../../vision/exploredShapes';
import { polygonBox } from '../../vision/polygonBounds';
import type { Point } from '../../types/visionTypes';
import type { Polygon } from '../../vision/visibility';
import { destroyTree } from '../utils/destroyTree';

/** Side of the scratch target and of the tiles a stamp is drawn in, in texels. */
export const TILE = 512;

/** A rectangle of texels in the explored memory. */
export interface TexelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a stamp lands in the memory: the bounds of what it draws (of the clip where that is
 * smaller), in texels, cut to the texture. Null when it draws nothing.
 */
export function stampRegion({ polygons, clip, ambient, within }: ExploredShapes, scale: number, limit: { width: number; height: number }): TexelRegion | null {
  // The ambient light of a scene with zones is painted over the whole clip.
  const drawn = ambient && clip ? boundsOf(clip) : boundsOf(polygons);
  const visible = clip ? boundsOf(clip) : drawn;
  if (!drawn || !visible) return null;
  const x0 = Math.max(0, within?.x ?? 0, Math.floor(Math.max(drawn.minX, visible.minX) * scale));
  const y0 = Math.max(0, within?.y ?? 0, Math.floor(Math.max(drawn.minY, visible.minY) * scale));
  const x1 = Math.min(limit.width, within ? within.x + within.columns : Infinity, Math.ceil(Math.min(drawn.maxX, visible.maxX) * scale));
  const y1 = Math.min(limit.height, within ? within.y + within.rows : Infinity, Math.ceil(Math.min(drawn.maxY, visible.maxY) * scale));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/** The corners of the `TILE`-aligned tiles that `region` touches. */
export function tilesOf(region: TexelRegion): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let y = Math.floor(region.y / TILE) * TILE; y < region.y + region.height; y += TILE) {
    for (let x = Math.floor(region.x / TILE) * TILE; x < region.x + region.width; x += TILE) tiles.push({ x, y });
  }
  return tiles;
}

/**
 * A fixed multisampled target the explored stamps are drawn into one tile at a time, so their
 * edges are anti-aliased without making the whole memory texture multisampled, and however
 * large a stamp is, this costs the same.
 */
export class StampScratch {
  private readonly target = RenderTexture.create({ width: TILE, height: TILE, antialias: true });
  private readonly stamp = new Container();
  /** What a stamp paints: the ambient light of a scene with zones (`ambientPainter`), then one shape per polygon. */
  private readonly painter = new Container();
  private readonly ambientPainter = new Graphics();
  /** The clip's shapes, one per polygon, as a stencil mask over the painter. */
  private readonly clip = new Container();
  /** Magical darkness: black over what was painted, so nothing of it is recorded. */
  private readonly hole = new Graphics();
  /** The darkness again, in white, shown only where a sense that sees in it perceives it. */
  private readonly pierced = new Graphics();
  private readonly piercing = new Graphics();
  /** Erases what lies outside the memory texels a stamp may record in (`ExploredShapes.within`), drawn last. */
  private readonly outsideBox = new Graphics();
  private readonly outsideTexels = new Sprite(Texture.EMPTY);
  /** The texture `outsideTexels` shows, made for the mask it was made from. */
  private outside: { mask: TexelMask; texture: Texture } | null = null;
  /**
   * The shape each polygon of `painter` and of the clip is drawn as, kept while the stamps hold it:
   * a token's sight changes on every step of a drag while the lights' polygons it is drawn through
   * stay the same objects (all but those of a light carried along), and drawing them again cut
   * every one into triangles anew.
   */
  private readonly painted = new Map<Polygon, Container>();
  private readonly clipped = new Map<Polygon, Container>();

  constructor(private readonly renderer: Renderer) {
    this.painter.addChild(this.ambientPainter);
    this.stamp.addChild(this.painter, this.clip, this.hole, this.pierced, this.piercing, this.outsideBox, this.outsideTexels);
    this.pierced.mask = this.piercing;
    this.outsideBox.blendMode = 'erase';
    this.outsideTexels.blendMode = 'erase';
  }

  /** Builds the shapes once, for a memory stamped at `scale` texels per world pixel; `renderTile` then only moves them. */
  begin({ polygons, clip, except, ambient, within, fans }: ExploredShapes, scale = 1): void {
    this.ambientPainter.clear();
    if (ambient) this.paintAmbient(ambient, clip ?? []);
    keepShapes(this.painted, this.painter, polygons, fans);
    keepShapes(this.clipped, this.clip, clip ?? [], fans);
    this.painter.mask = clip ? this.clip : null;
    // The scratch is merged with `max`: black records nothing.
    fillPolygons(this.hole.clear(), except?.areas ?? [], 0x000000);
    const seenInDarkness = except && except.unless.length > 0;
    fillPolygons(this.pierced.clear(), seenInDarkness ? except.areas : []);
    fillPolygons(this.piercing.clear(), seenInDarkness ? except.unless : []);
    this.keepWithin(within ?? null, scale);
  }

  /**
   * Erases every texel outside `mask` from what is drawn: around its box with four rectangles, inside
   * it with a sprite whose texels are opaque where the mask leaves a texel out, drawn texel on pixel.
   */
  private keepWithin(mask: TexelMask | null, scale: number): void {
    this.outsideBox.clear();
    this.outsideTexels.visible = !!mask;
    if (!mask) return;
    if (this.outside?.mask !== mask) {
      this.outside?.texture.destroy(true);
      const pixels = new Uint8Array(mask.columns * mask.rows * 4);
      for (let i = 0; i < mask.allowed.length; i++) pixels[i * 4 + 3] = mask.allowed[i] ? 0 : 255;
      const source = new BufferImageSource({ resource: pixels, width: mask.columns, height: mask.rows, format: 'rgba8unorm', scaleMode: 'nearest', alphaMode: 'premultiplied-alpha' });
      this.outside = { mask, texture: new Texture({ source }) };
    }
    this.outsideTexels.texture = this.outside.texture;
    this.outsideTexels.position.set(mask.x / scale, mask.y / scale);
    this.outsideTexels.scale.set(1 / scale);
    const [left, top, right, bottom] = [mask.x / scale, mask.y / scale, (mask.x + mask.columns) / scale, (mask.y + mask.rows) / scale];
    // Far enough to cover any memory: its texels lie within the map.
    const far = 1e7;
    this.outsideBox.rect(-far, -far, 2 * far, top + far).rect(-far, bottom, 2 * far, far)
      .rect(-far, top, left + far, bottom - top).rect(right, top, far, bottom - top).fill({ color: 0xffffff, alpha: 1 });
  }

  /** Where the ambient light of a scene with zones is lit: the scene itself over the clip's bounds, then each zone in its order, lit or dark. */
  private paintAmbient({ base, zones }: NonNullable<ExploredShapes['ambient']>, clip: readonly Polygon[]): void {
    const bounds = boundsOf(clip);
    if (base && bounds) this.ambientPainter.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY).fill({ color: 0xffffff });
    for (const { polygon, lit } of zones) fillPolygons(this.ambientPainter, [polygon], lit ? 0xffffff : 0x000000);
  }

  /** Draws the begun shapes into the scratch so it shows the tile at (`x`, `y`) of the memory. */
  renderTile(scale: number, x: number, y: number): RenderTexture {
    this.renderer.render({
      container: this.stamp,
      target: this.target,
      clear: true,
      clearColor: [0, 0, 0, 0],
      transform: new Matrix(scale, 0, 0, scale, -x, -y),
    });
    return this.target;
  }

  destroy(): void {
    this.outsideTexels.texture = Texture.EMPTY;
    this.outside?.texture.destroy(true);
    this.outside = null;
    this.painted.clear();
    this.clipped.clear();
    destroyTree(this.stamp);
    this.target.destroy(true);
  }
}

function boundsOf(polygons: readonly Polygon[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    // Worked out once per polygon: the lights' polygons are the same objects at every step of a drag.
    const box = polygonBox(polygon);
    bounds ??= { ...box };
    bounds.minX = Math.min(bounds.minX, box.minX);
    bounds.minY = Math.min(bounds.minY, box.minY);
    bounds.maxX = Math.max(bounds.maxX, box.maxX);
    bounds.maxY = Math.max(bounds.maxY, box.maxY);
  }
  return bounds;
}

/**
 * One shape per polygon in `parent`, white, those of polygons drawn before kept as they were (after
 * the parent's first child, which stays: the painter's ambient light).
 */
function keepShapes(kept: Map<Polygon, Container>, parent: Container, polygons: readonly Polygon[], fans: ExploredShapes['fans']): void {
  const wanted = new Set(polygons.filter((polygon) => polygon.length >= 3));
  for (const [polygon, shape] of kept) {
    if (wanted.has(polygon)) continue;
    kept.delete(polygon);
    destroyTree(shape);
  }
  for (const polygon of wanted) {
    if (kept.has(polygon)) continue;
    const shape = shapeOf(polygon, fans?.get(polygon));
    kept.set(polygon, shape);
    parent.addChild(shape);
  }
}

/**
 * A polygon filled in white: a fan from the point it is seen from where it is star-shaped around
 * one (`ExploredShapes.fans`), which covers it exactly; otherwise cut into triangles.
 */
function shapeOf(polygon: Polygon, from: Point | undefined): Container {
  if (!from) return fillPolygons(new Graphics(), [polygon]);
  const positions = new Float32Array(2 * (polygon.length + 1));
  positions[0] = from.x;
  positions[1] = from.y;
  polygon.forEach((p, i) => {
    positions[2 + 2 * i] = p.x;
    positions[3 + 2 * i] = p.y;
  });
  const indices = new Uint32Array(3 * polygon.length);
  for (let i = 0; i < polygon.length; i++) indices.set([0, i + 1, ((i + 1) % polygon.length) + 1], 3 * i);
  return new Mesh({ geometry: new MeshGeometry({ positions, uvs: new Float32Array(positions.length), indices }), texture: Texture.WHITE });
}

function fillPolygons(g: Graphics, polygons: readonly Polygon[], color = 0xffffff): Graphics {
  for (const polygon of polygons) {
    if (polygon.length >= 3) g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color });
  }
  return g;
}
