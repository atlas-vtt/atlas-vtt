import type { PathFn } from '../../art/paths';
import type { Vec } from '../../geometry';
import type { GlyphPen } from '../../glyphPen';
import { charredFuel, fireGlow } from '../fire/burning';
import { flames, type Flame } from '../fire/flame';
import { ASH_DOTS, inBox, logsIn } from './parts';
import type { Part } from './shapes';

/**
 * A lit fireplace's fuel: the cold fire's two logs burnt black, embers glowing along their splits,
 * sparks on the hearth between them and four flames rising from them, leaning back towards the
 * flue (+y), over a bed that glows from the middle of the firebox.
 */

interface BurningFuel {
  middle: Vec;
  glow: { rx: number; ry: number };
  logs: PathFn;
  splits: number[];
  sparks: (readonly [number, number, number])[];
  flames: Flame[];
}

/** Each flame as shares of the firebox: where it stands, how it leans off straight back, its size and how crooked; they rise from the two logs. */
const FLAMES: readonly (readonly [number, number, number, number, number])[] = [
  [-0.2, -0.12, -0.25, 0.95, -0.5], [0.14, -0.14, 0.18, 0.85, 0.4],
  [-0.06, 0.12, -0.08, 1.1, 0.25], [0.24, 0.1, 0.3, 0.75, -0.35],
];

function burningFuelIn(b: Part): BurningFuel {
  const { logs, splits } = logsIn(b);
  return {
    middle: { x: b.x, y: b.y },
    glow: { rx: b.w * 0.75, ry: b.h * 0.95 },
    logs,
    splits,
    sparks: ASH_DOTS.map(([x, y]) => {
      const p = inBox(b, x, y);
      return [p.x, p.y, 0.012] as const;
    }),
    flames: FLAMES.map(([x, y, side, size, bend]) => {
      const len = Math.hypot(side, 1);
      return { at: inBox(b, x, y), r: b.h * 0.1 * size, length: b.h * 0.34 * size, lean: { x: side / len, y: 1 / len }, bend };
    }),
  };
}

const fuels = new WeakMap<Part, BurningFuel>();

/** The burning fuel lying at `b` in a firebox whose recess is `bed`: glow, charred logs with their embers, then the flames over them. */
export function burningFuel(pen: GlyphPen, b: Part, bed: PathFn): void {
  let fuel = fuels.get(b);
  if (!fuel) {
    fuel = burningFuelIn(b);
    fuels.set(b, fuel);
  }
  fireGlow(pen, bed, fuel.middle, fuel.glow.rx, fuel.glow.ry);
  charredFuel(pen, fuel.logs, fuel.splits, fuel.sparks);
  flames(pen, fuel.flames);
}
