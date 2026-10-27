import type { ArtScene } from '../art/artScene';
import type { Hand, PileStone, Weight } from '../art/hand';
import { SHADOW_DIR } from '../art/light';
import { pileLayers, STRAY } from '../art/pileLayers';
import type { Canvas2D, Vec } from '../geometry';
import type { StoneColours } from './colours';
import { rockTone, rockTones, stoneFacets, toneStep } from './rockFacets';

/** The least reach of a stone that shows its facets, in cells: a smaller chip is a few pixels at play size, its rock colour enough. */
const FACETED = 0.06;
/** Tone steps to a unit of light on a stone's facets, as on the surround's slabs. */
const FACET_STEPS = 4;
/**
 * The tones a loose stone is blocked in: its colour, its shaded faces and its lit ones, the steps
 * of `rockTones` they take. Three tones, as a painter blocks in rubble, and two fills a layer.
 */
const PILE_TONE = { shade: 2, lit: 1 };
/** How far a stone's contact shadow falls on the stones beneath, as a share of its reach, and at least, in cells. */
const CONTACT = { share: 0.22, least: 0.012 };
/** How dark a contact shadow is, in light and dark looks. */
const CONTACT_ALPHA = { light: 0.26, dark: 0.32 };

function tracePolys(ctx: Canvas2D, polys: readonly (readonly Vec[])[]): void {
  for (const poly of polys) {
    ctx.moveTo(poly[0]!.x, poly[0]!.y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i]!.x, poly[i]!.y);
    ctx.closePath();
  }
}

/** Whether a facet lit `light` is drawn shaded (−1), in the rock's colour (0) or lit (1). */
function pileTone(light: number): number {
  return Math.sign(toneStep(light, FACET_STEPS));
}

function fillPolys(ctx: Canvas2D, polys: readonly (readonly Vec[])[], colour: string): void {
  if (!polys.length) return;
  ctx.beginPath();
  tracePolys(ctx, polys);
  ctx.fillStyle = colour;
  ctx.fill();
}

/**
 * The shadows `stones` cast on the stones already drawn beneath them, and on nothing else; the clip
 * holds only the stones a shadow can reach, not the whole pile beneath.
 */
function contactShadows(ctx: Canvas2D, c: StoneColours, stones: readonly PileStone[], beneath: readonly PileStone[]): void {
  const reached = beneath.filter(b => stones.some(s => Math.hypot(b.c.x - s.c.x, b.c.y - s.c.y) < (b.r + s.r) * STRAY + s.r * CONTACT.share));
  if (!reached.length) return;
  ctx.save();
  ctx.beginPath();
  tracePolys(ctx, reached.map(s => s.poly));
  ctx.clip();
  ctx.beginPath();
  tracePolys(ctx, stones.map(s => {
    const fall = Math.max(CONTACT.least, s.r * CONTACT.share);
    return s.poly.map(p => ({ x: p.x + SHADOW_DIR.x * fall, y: p.y + SHADOW_DIR.y * fall }));
  }));
  ctx.fillStyle = `rgba(0, 0, 0, ${c.dark ? CONTACT_ALPHA.dark : CONTACT_ALPHA.light})`;
  ctx.fill();
  ctx.restore();
}

function outline(hand: Hand, stones: readonly PileStone[], weight: (stone: PileStone) => Weight): void {
  for (const w of ['fine', 'outline', 'heavy'] as const) {
    const runs = stones.filter(s => weight(s) === w).map(s => s.poly);
    if (runs.length) hand.line(runs, w, true);
  }
}

/**
 * A pile of rock, back to front, a layer of stones that do not overlap at a time: the shadow each
 * stone casts where it lies on another, its body filled whole in the rock's own colour so nothing
 * beneath shows through, its own flat facets shaded or lit by their facing, and its outline.
 * Chips too small to show facets lie beneath them all, in the rock's colour. The facets are the stone's own, never a
 * texture laid across the map, whose cracks ran on through every stone.
 */
export function paintPile(scene: ArtScene, hand: Hand, c: StoneColours, stones: readonly PileStone[], weight: (stone: PileStone) => Weight): void {
  const { ctx } = scene.env;
  const tones = rockTones(c);
  const seed = scene.env.dungeon.model.seed;
  // Chips go down first, all at once: a few pixels at play size, they show no facets and a contact
  // shadow on or from one shows no more, and layering them with the stones cost a scree a tenth of its drawing.
  const chips = stones.filter(s => s.r < FACETED);
  const beneath: PileStone[] = [];
  fillPolys(ctx, chips.map(s => s.poly), c.rock);
  outline(hand, chips, weight);
  for (const layer of pileLayers(stones.filter(s => s.r >= FACETED))) {
    if (beneath.length) contactShadows(ctx, c, layer, beneath);
    fillPolys(ctx, layer.map(s => s.poly), c.rock);
    const shaded: Vec[][] = [];
    const lit: Vec[][] = [];
    for (const stone of layer) {
      for (const { face, light } of stoneFacets(stone.poly, seed, pileTone)) {
        const tone = pileTone(light);
        if (tone < 0) shaded.push(face);
        else if (tone > 0) lit.push(face);
      }
    }
    fillPolys(ctx, shaded, rockTone(tones, -PILE_TONE.shade));
    fillPolys(ctx, lit, rockTone(tones, PILE_TONE.lit));
    outline(hand, layer, weight);
    beneath.push(...layer);
  }
}
