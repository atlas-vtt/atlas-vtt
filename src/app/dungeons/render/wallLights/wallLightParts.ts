import type { PathFn } from '../art/paths';
import type { Vec } from '../geometry';
import type { GlyphPen } from '../glyphPen';
import { mixColours } from '../palette';
import { fireColours, fireGlow } from '../props/fire/burning';
import { flames } from '../props/fire/flame';
import { colours, isPainted, onDarkFloor, stick, surface } from '../props/livedIn/parts';
import { OFF_WALL } from '../propsAsDrawn';

/**
 * What the wall lights share: the floor's glow before a flame, a torch's shaft and its pitch-soaked
 * head, the flame itself (the fires' own teardrops, `flame.ts`), and a sconce's brass.
 */

/** The floor before a wall light, on the room's side of its wall: where its glow may fall. */
const BEFORE_WALL: PathFn = path => path.rect(-0.8, -0.9, 1.6, 0.9 + OFF_WALL);

/** The glow a flame throws on the floor and wall face round it, `r` cells across, as faint as `strength`: Stone's raster wash alone. */
export function floorGlow(pen: GlyphPen, at: Vec, r: number, strength: number, clip: PathFn = BEFORE_WALL): void {
  fireGlow(pen, clip, at, r, r, strength);
}

/** A torch's shaft from `base` to `head`, its wood's grain along it. */
export function torchShaft(pen: GlyphPen, base: Vec, head: Vec, width: number): void {
  const shaft = stick(base, head, width, width * 1.15, 0.002);
  surface(pen, path => {
    path.moveTo(shaft[0]!.x, shaft[0]!.y);
    for (const p of shaft.slice(1)) path.lineTo(p.x, p.y);
    path.closePath();
  }, 'wood', !isPainted(pen));
}

/** A torch's head: rags wound round its end and soaked in pitch, charred black where the flame stands on them, two windings showing. */
export function torchHead(pen: GlyphPen, at: Vec, r: number, along: Vec): void {
  const { ctx } = pen;
  const { char } = fireColours(pen);
  const n = { x: -along.y, y: along.x };
  surface(pen, path => {
    path.ellipse(at.x, at.y, r, r * 0.82, Math.atan2(along.y, along.x), 0, Math.PI * 2);
  }, 'cloth', false, true, isPainted(pen) ? char : colours(pen, 'floor').fill, isPainted(pen) ? mixColours(char, '#000000', 0.4) : undefined);
  const ink = ctx.strokeStyle;
  ctx.strokeStyle = isPainted(pen) ? fireColours(pen).ember : colours(pen, 'cloth').ink;
  ctx.beginPath();
  for (const k of [-0.45, 0.35]) {
    const c = { x: at.x + along.x * r * k, y: at.y + along.y * r * k };
    ctx.moveTo(c.x - n.x * r * 0.8, c.y - n.y * r * 0.8);
    ctx.lineTo(c.x + n.x * r * 0.8, c.y + n.y * r * 0.8);
  }
  ctx.lineWidth = pen.fine;
  ctx.stroke();
  ctx.strokeStyle = ink;
}

/** A torch's flame: a teardrop standing on its head `r` across at its base, `length` long, pointing out from the wall (`lean`), crooked a little. */
export function torchFlame(pen: GlyphPen, at: Vec, r: number, length: number, lean: Vec): void {
  flames(pen, [{ at, r, length, lean, bend: -0.35 }]);
}

/** A candle's flame: one small teardrop on its wick, pointing out from the wall, `bend` crooked. */
export function candleFlame(pen: GlyphPen, at: Vec, r: number, lean: Vec, bend: number): void {
  flames(pen, [{ at, r, length: r * 3.2, lean, bend }]);
}

/** A sconce's brass: the iron's own paint warmed to yellow metal where the look has colour; iron where it has none or is dark. */
export function brass(pen: GlyphPen): { fill: string; ink: string } {
  const metal = colours(pen, 'metal');
  const { view } = pen.hand.scene.env;
  if (!isPainted(pen) || view.monochrome) return metal;
  return { fill: mixColours(metal.fill, onDarkFloor(pen) ? '#9a7630' : '#cca24c', 0.85), ink: mixColours(metal.ink, '#4a3410', 0.6) };
}
