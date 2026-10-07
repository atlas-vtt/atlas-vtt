/**
 * The colour of the dice, as painted into their face atlas: the ground of each
 * cell, its worn rim and the colour of the numerals. The light dice are the
 * card stock as it is; dark and accent dice lay a colour under the card's grain,
 * so the faces keep their paper texture in any colour.
 */

import { CELL, seededRandom } from './atlasCell';
import type { LookArt } from './customLookArt';
import type { CustomDiceLook } from './customLooks';
import {
  DARK_INK, DEFAULT_DICE_LOOK, LIGHT_INK, parseHex, readableInk, type DiceColour, type DiceFont, type DiceLook, type Rgb,
} from './diceLook';

/** A look with its colours worked out for painting. */
export interface ResolvedLook {
  colour: DiceColour;
  font: DiceFont;
  /** The body colour; null keeps the card stock's own tone. */
  body: string | null;
  /** The numeral colour; null keeps the pencil sheet's graphite. */
  ink: string | null;
  /** The full id of the extension's dice look in effect (`customLooks`); null for Atlas's own. */
  lookId: string | null;
  /** That look's face art, painted where it has some; null for Atlas's own look. */
  art: LookArt | null;
  /** `face`: the art covers its whole face cell (`DiceLookSpec.fill`); unset paints it where the numeral goes. */
  fill?: 'face';
}

/** The card tone while the paper image has not arrived yet. */
const CARD = '#a98f66';
/** A dark body: near black, a touch warm, so the grain still shows. */
const DARK_BODY = '#1f1e21';
/** How strongly the card's grain shows through a coloured body. */
const GRAIN_ALPHA = 0.55;
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
  const own = { lookId: null, art: null };
  if (look.colour === 'dark') return { ...look, ...own, body: DARK_BODY, ink: LIGHT_INK };
  if (look.colour === 'accent') {
    const colour = accent ?? FALLBACK_ACCENT;
    return { ...look, ...own, body: hex(colour), ink: readableInk(colour) };
  }
  // Light dice keep the pencil drawing's graphite; set numerals need a colour of their own.
  return { ...look, ...own, body: null, ink: look.font === 'medieval' ? null : DARK_INK };
}

/**
 * An extension's look with its art: its body colour (the card stock without one), and for faces it has no art for,
 * Atlas's numerals in the user's font and the look's ink, or the ink that reads on its body.
 */
export function resolveCustomLook(look: DiceLook, custom: Pick<CustomDiceLook, 'id' | 'body' | 'ink' | 'fill'>, art: LookArt): ResolvedLook {
  const body = custom.body !== null && parseHex(custom.body) ? custom.body : null;
  const bodyRgb = body === null ? null : parseHex(body);
  const fallbackInk = bodyRgb ? readableInk(bodyRgb) : look.font === 'medieval' ? null : DARK_INK;
  const ink = custom.ink !== null && parseHex(custom.ink) ? custom.ink : fallbackInk;
  return { colour: look.colour, font: look.font, body, ink, lookId: custom.id, art, ...(custom.fill === 'face' ? { fill: 'face' as const } : {}) };
}

/**
 * The ground of a face: a cut from the card stock, taken from a different spot
 * per cell. The same cut on twenty faces would look stamped, precisely when
 * the die turns. A coloured body lies under the cut, which then only lends it grain.
 */
export function paintCard(
  ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, card: HTMLImageElement | null, look: ResolvedLook,
): void {
  ctx.fillStyle = look.body ?? CARD;
  ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  if (card === null) return;
  const random = seededRandom(seed);
  const sx = random() * Math.max(1, card.width - CELL);
  const sy = random() * Math.max(1, card.height - CELL);
  ctx.save();
  if (look.body !== null) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = GRAIN_ALPHA;
  }
  ctx.drawImage(card, sx, sy, CELL, CELL, x - CELL / 2, y - CELL / 2, CELL, CELL);
  ctx.restore();
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
