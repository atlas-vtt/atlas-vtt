/**
 * Stone & shadow's tree crowns, painted as an illustrator paints a tree from above: the crown edged
 * with a thin dark line against the lawn and its low body laid in a cool deep; then mass over mass
 * from the rim up, each with its core shadow on the side away from the light, its body, and its
 * warm lit leaves with a few loose leaf dabs towards the light, so every higher mass casts its own
 * dark edge over the ones below. Gaps show dark holes with a limb across. A conifer's whorls are
 * shaded alike, their needles drawn out from the leader, lit towards the light and dark away.
 */

import { SHADOW_DIR, TO_LIGHT } from '../art/light';
import type { Hand } from '../art/hand';
import { polyPath } from '../art/paths';
import type { Canvas2D, Vec } from '../geometry';
import type { Rgb } from '../palette';
import type { StoneColours } from '../stone/colours';
import { css, rampAt, type PlantColours, type Ramp } from '../stone/plantColours';
import { traceShape, type Clump, type Crown } from './crowns';

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as Rgb;
const mixRamp = (a: Ramp, b: Ramp, t: number): Ramp => [mixRgb(a[0], b[0], t), mixRgb(a[1], b[1], t), mixRgb(a[2], b[2], t)];

interface CrownColours {
  /** The leaves' own ramp, this tree's shade of it. */
  leaf: Ramp;
  /** What shadows go towards: bluer, never black. */
  cool: Ramp;
  /** What light goes towards: yellower. */
  warm: Ramp;
  litAlpha: number;
}

function crownColours(plants: PlantColours, crown: Crown): CrownColours {
  const { green, fern, flowering, bramble, grass } = plants.leaves;
  const leaf = crown.species === 'conifer' ? mixRamp(bramble, green, 0.35 + 0.15 * crown.tint) : mixRamp(green, crown.tint < 0 ? flowering : fern, Math.abs(crown.tint) * 0.6);
  return { leaf, cool: mixRamp(bramble, leaf, 0.25), warm: mixRamp(leaf, grass, 0.55), litAlpha: plants.dark ? 0.55 : 1 };
}

/** How lit a mass is: higher in the crown and nearer its lit side, the lighter. */
function toneOf(crown: Crown, clump: Clump): number {
  const side = ((clump.centre.x - crown.centre.x) * SHADOW_DIR.x + (clump.centre.y - crown.centre.y) * SHADOW_DIR.y) / crown.radius;
  return 0.32 + 0.3 * clump.height - 0.22 * side + 0.05 * crown.tint;
}

export function paintCrown(hand: Hand, c: StoneColours, plants: PlantColours, crown: Crown): void {
  const { ctx } = hand.scene.env;
  const colours = crownColours(plants, crown);
  // The thin dark edge that holds the crown off the lawn, round the masses its silhouette is made of: they cover all of it but its outer half.
  ctx.beginPath();
  for (const clump of crown.clumps) if (clump.height < 0.2) traceShape(ctx, clump.shape);
  ctx.strokeStyle = css(plants.edge, c.dark ? 0.6 : 0.75);
  ctx.lineWidth = hand.weight('fine') * 2.6;
  ctx.lineJoin = 'miter';
  ctx.stroke();
  const leaves = (masses: readonly Clump[], tone: number): void => {
    ctx.beginPath();
    for (const clump of masses) traceLeaves(ctx, clump.leaves);
    ctx.fillStyle = rampAt(colours.warm, tone + 0.42, colours.litAlpha);
    ctx.fill();
  };
  const rim = crown.clumps.filter((clump) => clump.height < 0.2 && !clump.body);
  const rimLeaves = (): void => {
    if (crown.species === 'broadleaf') leaves(rim, rim.reduce((sum, clump) => sum + toneOf(crown, clump), 0) / Math.max(1, rim.length));
    drawGaps(ctx, hand, plants, colours, crown);
  };
  let rimDone = false;
  for (const clump of crown.clumps) {
    if (clump.body) {
      // The body's face is all but hidden by the masses on it: its deep is enough.
      ctx.beginPath();
      traceShape(ctx, clump.shape);
      ctx.fillStyle = rampAt(colours.cool, 0.04);
      ctx.fill();
      continue;
    }
    // Once the rim is painted: the rim's leaves together (its masses barely cover each other), then the gaps, which lie below the middle masses.
    if (!rimDone && clump.height > 0.2) {
      rimLeaves();
      rimDone = true;
    }
    const tone = toneOf(crown, clump);
    ctx.beginPath();
    traceShape(ctx, clump.shape);
    ctx.fillStyle = rampAt(colours.cool, tone - 0.18);
    ctx.fill();
    ctx.beginPath();
    traceShape(ctx, clump.lit);
    ctx.fillStyle = rampAt(colours.leaf, tone + 0.06);
    ctx.fill();
    if (crown.species === 'conifer') needles(ctx, hand, clump, colours, tone);
    else if (clump.height > 0.2) leaves([clump], tone);
  }
  if (!rimDone) rimLeaves();
}

/** Holes in the leaves down into the crown's dark, each with its limb across it. */
function drawGaps(ctx: Canvas2D, hand: Hand, plants: PlantColours, colours: CrownColours, crown: Crown): void {
  if (!crown.gaps.length) return;
  ctx.beginPath();
  for (const gap of crown.gaps) polyPath(gap.ring)(ctx);
  ctx.fillStyle = css(mixRgb(colours.cool[0], plants.hole, 0.35));
  ctx.fill();
  ctx.beginPath();
  for (const { limb } of crown.gaps) {
    ctx.moveTo(limb[0].x, limb[0].y);
    ctx.lineTo(limb[1].x, limb[1].y);
  }
  // Bark lit a little, or the limb is lost in the dark it crosses.
  ctx.strokeStyle = css(mixRgb(plants.stems.green, colours.warm[2], 0.3));
  ctx.lineWidth = hand.weight('fine') * 2.4;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Each three points a leaf. */
function traceLeaves(ctx: Canvas2D, leaves: readonly Vec[]): void {
  for (let k = 0; k + 2 < leaves.length; k += 3) {
    ctx.moveTo(leaves[k]!.x, leaves[k]!.y);
    ctx.lineTo(leaves[k + 1]!.x, leaves[k + 1]!.y);
    ctx.lineTo(leaves[k + 2]!.x, leaves[k + 2]!.y);
    ctx.closePath();
  }
}

/** A conifer whorl's needles: strokes out from its leader to every branch tip, lit on its lit side, dark on the other. */
function needles(ctx: Canvas2D, hand: Hand, { centre, ring }: Clump, colours: CrownColours, tone: number): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = hand.weight('fine') * 0.9;
  for (const lit of [false, true]) {
    ctx.beginPath();
    // Every fourth point of the ring is a branch's tip.
    for (let k = 1; k < ring.length; k += 4) {
      const tip = ring[k]!;
      const dx = tip.x - centre.x;
      const dy = tip.y - centre.y;
      if (dx * TO_LIGHT.x + dy * TO_LIGHT.y > 0 !== lit) continue;
      for (const s of [-1, 0, 1]) {
        const spread = s * 0.06;
        const reach = 0.92 - Math.abs(s) * 0.2;
        ctx.moveTo(centre.x + dx * 0.3 - dy * spread, centre.y + dy * 0.3 + dx * spread);
        ctx.lineTo(centre.x + dx * reach - dy * spread * 2, centre.y + dy * reach + dx * spread * 2);
      }
    }
    ctx.strokeStyle = lit ? rampAt(colours.warm, tone + 0.5, colours.litAlpha) : rampAt(colours.cool, tone - 0.3);
    ctx.stroke();
  }
}
