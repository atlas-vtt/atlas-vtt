import type { ArtScene } from '../art/artScene';
import { hash2 } from '../art/noise';
import { pathBounds, type Field, type PathFn } from '../art/paths';
import { withClip } from '../grounds/paint';
import type { Bounds } from '../geometry';
import { mapLayout } from '../layoutSize';
import { withAlpha } from '../palette';
import { drawVellum } from '../vellum';
import type { CrayonFill } from './colours';
import { areaMask, type AreaMask } from './areaMask';
import { crayonArea, crayonUnit } from './hachure';
import { crayonPaint } from './tooth';

/**
 * What Crayon colours and covers with: the crayons, laid by hand on the paper's tooth, and the
 * vellum itself, which bare ground is drawn in (a floor is the paper the map is drawn on, not a
 * colour laid over it).
 */
export interface CrayonBox {
  /** Colours `path` in with `fill`; heavier where `strength` (0..1) is higher, if given. */
  colourIn(path: PathFn, fill: CrayonFill, strength?: Field, bounds?: Bounds): void;
  /** The vellum again inside `path`, as the paper round the map shows it, covering what lies under it. */
  paper(path: PathFn): void;
}

/** An area's own angle and strokes, from where it lies and how wide it is, so a map draws the same in any order. */
function areaSeed(bounds: Bounds, salt: number): number {
  return Math.floor(hash2(Math.round(bounds.minX * 64), Math.round(bounds.minY * 64), salt + Math.round((bounds.maxX - bounds.minX) * 64)) * 0xffffffff);
}

export function crayonBox(scene: ArtScene): CrayonBox {
  const { ctx, dungeon, view, palette, pxPerCell } = scene.env;
  const unit = crayonUnit(pxPerCell);
  const salt = Math.floor(scene.env.rng('crayon')() * 0xffffffff);
  const strokes = scene.raster && typeof Path2D !== 'undefined';
  let layout: ReturnType<typeof mapLayout> | null = null;
  let mask: { path: PathFn; inside: AreaMask | null } | null = null;
  const paints = new Map<string, string | CanvasPattern>();
  const paintOf = (colour: string): string | CanvasPattern => {
    const known = paints.get(colour);
    if (known) return known;
    const paint = crayonPaint(ctx, colour);
    paints.set(colour, paint);
    return paint;
  };
  return {
    colourIn: (path, fill, strength, known) => {
      // Monochrome is graphite on the paper alone.
      if (view.monochrome) return;
      const bounds = known ?? pathBounds(path);
      if (!bounds) return;
      if (!strokes) {
        // Without pictures (the SVG export) a crayon is a flat wash of its colour.
        ctx.save();
        ctx.beginPath();
        path(ctx);
        ctx.fillStyle = withAlpha(fill.colour, fill.cover * 0.45);
        ctx.fill();
        ctx.restore();
        return;
      }
      // Water and molten rock are coloured twice over one path: its mask is made once.
      if (mask?.path !== path) mask = { path, inside: areaMask(path, bounds) };
      const { inside } = mask;
      // A piece is drawn turned and scaled: its strokes keep the map's size.
      const m = ctx.getTransform();
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / pxPerCell || 1;
      crayonArea(ctx, { path, bounds, paint: paintOf(fill.colour), cover: fill.cover, passes: fill.passes, seed: areaSeed(bounds, salt), ...(strength && { strength }), ...(inside && { inside }), ...(fill.angle !== undefined && { angle: fill.angle }) }, unit / scale);
    },
    paper: (path) => {
      const at = (layout ??= mapLayout(dungeon.model, pxPerCell, view));
      withClip(ctx, path, () => {
        ctx.translate(at.originCell.x, at.originCell.y);
        ctx.scale(1 / pxPerCell, 1 / pxPerCell);
        drawVellum(ctx, palette.paper, at, dungeon.model.seed, view.monochrome || !scene.raster, 1, false);
      });
    },
  };
}
