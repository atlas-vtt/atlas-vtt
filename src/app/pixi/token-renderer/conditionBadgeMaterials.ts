import { FillGradient } from 'pixi.js';
import { mixColor } from '../../styles/designTokens';

/**
 * The fills of a condition badge, which reads as a gem set in a silver bezel: lit from the
 * upper left, the bezel's lip shading the gem's top edge and light gathering in its lower
 * edge. Fills depend only on a colour (or a radius), so every badge of one condition shares
 * them, and all are in the shape's own space (0 to 1 across its bounds).
 */

export const INK = 0x0b0b0e;
const WHITE = 0xffffff;

/** Polished silver lit from above, like the token's hammered ring. */
export const BEZEL_FILL = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  colorStops: [
    { offset: 0, color: 0xd4d4dc },
    { offset: 0.3, color: 0x9a9aa5 },
    { offset: 0.62, color: 0x55555f },
    { offset: 1, color: 0x2c2c33 },
  ],
});

/**
 * The gem's edge sinks into shade under the bezel's lip, all around. PIXI paints a radial
 * gradient's last stop under its whole texture, so a gradient that is clear inside must end clear.
 */
export const VIGNETTE_FILL = new FillGradient({
  type: 'radial',
  center: { x: 0.5, y: 0.5 },
  innerRadius: 0,
  outerCenter: { x: 0.5, y: 0.5 },
  outerRadius: 0.5,
  colorStops: [
    { offset: 0, color: 'rgba(0, 0, 0, 0)' },
    { offset: 0.74, color: 'rgba(0, 0, 0, 0)' },
    { offset: 0.98, color: 'rgba(0, 0, 0, 0.34)' },
    { offset: 1, color: 'rgba(0, 0, 0, 0)' },
  ],
});

/** A soft reflection of the light, high on the gem's upper left. */
export const GLINT_FILL = new FillGradient({
  type: 'radial',
  center: { x: 0.5, y: 0.5 },
  innerRadius: 0,
  outerCenter: { x: 0.5, y: 0.5 },
  outerRadius: 0.5,
  colorStops: [
    { offset: 0, color: 'rgba(255, 255, 255, 0.55)' },
    { offset: 0.45, color: 'rgba(255, 255, 255, 0.2)' },
    { offset: 1, color: 'rgba(255, 255, 255, 0)' },
  ],
});

const gemFills = new Map<number, FillGradient>();
const causticFills = new Map<number, FillGradient>();
const shadowFills = new Map<number, FillGradient>();

/** A dome in the condition's colour, lifted towards white where the light falls and deeper at its edge. */
export function gemFill(color: number): FillGradient {
  return cached(gemFills, color, () => new FillGradient({
    type: 'radial',
    center: { x: 0.38, y: 0.26 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: mixColor(color, WHITE, 0.3) },
      { offset: 0.5, color },
      { offset: 1, color: mixColor(color, INK, 0.08) },
    ],
  }));
}

/** The lip's shadow along the gem's top, and the light that gathers in its lower edge in a brighter tone of its colour. */
export function causticFill(color: number): FillGradient {
  return cached(causticFills, color, () => {
    const glow = mixColor(color, WHITE, 0.6);
    const rgb = `${(glow >> 16) & 0xff}, ${(glow >> 8) & 0xff}, ${glow & 0xff}`;
    return new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 'rgba(0, 0, 0, 0.16)' },
        { offset: 0.2, color: 'rgba(0, 0, 0, 0)' },
        { offset: 0.68, color: `rgba(${rgb}, 0)` },
        { offset: 0.92, color: `rgba(${rgb}, 0.55)` },
        { offset: 1, color: `rgba(${rgb}, 0.3)` },
      ],
    });
  });
}

/** A contact shadow, opaque to `solid` (a share of its radius) and fading out to its edge. */
export function shadowFill(solid: number, alpha: number): FillGradient {
  return cached(shadowFills, solid, () => new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: `rgba(0, 0, 0, ${alpha})` },
      { offset: solid, color: `rgba(0, 0, 0, ${alpha})` },
      { offset: 1, color: 'rgba(0, 0, 0, 0)' },
    ],
  }));
}

function cached(fills: Map<number, FillGradient>, key: number, make: () => FillGradient): FillGradient {
  let fill = fills.get(key);
  if (!fill) {
    fill = make();
    fills.set(key, fill);
  }
  return fill;
}
