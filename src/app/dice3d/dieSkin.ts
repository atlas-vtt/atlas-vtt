/**
 * The colour of the dice, as painted into their face atlas: the ground of each
 * cell, its worn rim and the colour of the numerals. The light dice are the
 * card stock as it is; dark, accent and set-coloured dice are the card stock
 * dyed in their colour (`dyedCard.ts`), so the faces keep their paper texture
 * in any colour.
 */

import { CELL, seededRandom } from './atlasCell';
import {
  DARK_INK, DEFAULT_DICE_LOOK, LIGHT_INK, parseHex, readableInk, type DiceColour, type DiceFont, type DiceLook, type Rgb,
} from './diceLook';
import { dyeCard } from './dyedCard';

/** A look with its colours worked out for painting. */
export interface ResolvedLook {
  colour: DiceColour;
  font: DiceFont;
  /** The body colour; null keeps the card stock's own tone. */
  body: string | null;
  /** The numeral colour; null keeps the pencil sheet's graphite. */
  ink: string | null;
}

/** The card tone while the paper image has not arrived yet. */
const CARD = '#a98f66';
/** A dark body: near black, a touch warm, so the grain still shows. */
const DARK_BODY = '#1f1e21';
/**
 * What the faces of a look are painted with changed in a way no look tells:
 * still images of dice (`dieImages.ts`) drawn before must not be reused.
 * 2: coloured bodies are dyed card instead of a colour under a soft-light grain.
 */
export const SKIN_REVISION = 2;
/** Obsidian's default accent, for a theme that does not report one. */
const FALLBACK_ACCENT: Rgb = [0x8a, 0x5c, 0xf5];

let active: ResolvedLook = resolveLook(DEFAULT_DICE_LOOK, null);

export function activeLook(): ResolvedLook {
  return active;
}

export function setActiveLook(look: ResolvedLook): void {
  active = look;
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** The colours of a look; `accent` is Obsidian's accent colour where the look needs it. */
export function resolveLook(look: DiceLook, accent: Rgb | null): ResolvedLook {
  if (look.colour === 'dark') return { ...look, body: DARK_BODY, ink: LIGHT_INK };
  if (look.colour === 'accent') {
    const colour = accent ?? FALLBACK_ACCENT;
    return { ...look, body: hex(colour), ink: readableInk(colour) };
  }
  // Light dice keep the pencil drawing's graphite; set numerals need a colour of their own.
  return { ...look, body: null, ink: look.font === 'medieval' ? null : DARK_INK };
}

/** What a face's ground is cut from: the card image, or the card dyed on a canvas. */
export type CardStock = HTMLImageElement | HTMLCanvasElement;

/**
 * The card stock a look paints its faces with: the card as it is for the light
 * dice, dyed in the body colour for the others; null while the card has not
 * arrived (or cannot be dyed), when faces show the bare ground colour.
 */
export function stockFor(card: HTMLImageElement | null, body: string | null): CardStock | null {
  if (card === null || body === null) return card;
  const rgb = parseHex(body);
  return rgb === null ? null : dyeCard(card, rgb);
}

/**
 * The ground of a face: a cut from the card stock, taken from a different spot
 * per cell. The same cut on twenty faces would look stamped, precisely when
 * the die turns. `body` is the ground under it while the stock is missing.
 */
export function paintCard(
  ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, stock: CardStock | null, body: string | null,
): void {
  ctx.fillStyle = body ?? CARD;
  ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  if (stock === null) return;
  const random = seededRandom(seed);
  const sx = random() * Math.max(1, stock.width - CELL);
  const sy = random() * Math.max(1, stock.height - CELL);
  ctx.drawImage(stock, sx, sy, CELL, CELL, x - CELL / 2, y - CELL / 2, CELL, CELL);
}

/**
 * **The worn rim.**
 *
 * A die that spent a long time in a bag is darker at the edges than in the
 * face: that is where the hand grips and where it knocks against its
 * neighbours. Without this gradient every face is evenly bright and the body
 * looks freshly pressed: clean, and therefore wrong.
 *
 * The cell is darkened radially, and that fits the face although it is a
 * triangle or pentagon: the polygon sits centred in its cell, so its rim lies
 * wherever the gradient turns dark. The last cell (chamfers and corners) gets
 * more of it than the faces, because the edges are what gets knocked. Card
 * darkens brown; a coloured body darkens towards black.
 */
export function paintWear(ctx: CanvasRenderingContext2D, x: number, y: number, edge: boolean, look: ResolvedLook): void {
  const [inner, outer] = look.body === null ? ['58 38 20', '44 28 14'] : ['0 0 0', '0 0 0'];
  const g = ctx.createRadialGradient(x, y, CELL * 0.2, x, y, CELL * 0.62);
  g.addColorStop(0, `rgb(${inner} / 0)`);
  g.addColorStop(0.6, `rgb(${inner} / ${edge ? 0.22 : 0.1})`);
  g.addColorStop(1, `rgb(${outer} / ${edge ? 0.62 : 0.4})`);
  ctx.fillStyle = g;
  ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
}
