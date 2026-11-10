/**
 * Single dice at rest as images, each in its colour with its highest face up:
 * the dice lab lays a set's dice out on its tray from these. One pooled stage
 * draws every image a call asks for and is read back in the same task, as the
 * dice look previews are; an image is kept, so a tray costs nothing while it
 * stands still and a die drawn once is never drawn again for the same look.
 */

import { getDomHost } from '../host/dom';
import { seededRandom } from './atlasCell';
import { layoutDice, restingFrame, sceneFromRolls } from './diceScene';
import { loadDiceArtwork } from './dieArtwork';
import { dieGeometry, faceIndexForValue, lyingHeight, REST_YAW, restingQuaternion } from './dieGeometry';
import { makeDie, restImmediately } from './dieMotion';
import { activeLook, SKIN_REVISION } from './dieSkin';
import { stagePixelRatio, type StageDie } from './DiceRenderer';
import { borrowStage, returnStage } from './stagePool';

/** One die to draw: its sides, and its colour where a set gives it one. */
export interface DieImageRequest {
  sides: number;
  colour?: string | undefined;
}

/** The height of an image in CSS pixels; the tray shows it at this size or smaller. */
export const DIE_IMAGE_SIZE = 136;

/** A die drawn: its image, and its width over its height (a d100's two d10s lie side by side). */
export interface DieImage {
  url: string;
  aspect: number;
}

/** Images kept: every die of a few looks. Each is a PNG of some tens of kilobytes. */
const KEPT = 96;

/** The image of each die drawn, by look and die; null where the die has no body. */
const images = new Map<string, DieImage | null>();

/** What a die's image depends on besides the die: the dice look of the settings, and how looks are painted. */
function lookKey(): string {
  const look = activeLook();
  return `${SKIN_REVISION}|${look.font}|${look.body ?? ''}|${look.ink ?? ''}`;
}

function keyOf({ sides, colour }: DieImageRequest, look: string): string {
  return `${look}|${sides}|${colour?.toLowerCase() ?? ''}`;
}

function keep(key: string, image: DieImage | null): void {
  images.delete(key);
  images.set(key, image);
  // The oldest go first: a Map keeps the order its keys were set in.
  while (images.size > KEPT) images.delete(images.keys().next().value!);
}

/**
 * The image of a die as drawn for the current look: null where the die has no
 * body (a d7) or the document draws no 3D dice, undefined while it has not been
 * drawn.
 */
export function dieImage(die: DieImageRequest): DieImage | null | undefined {
  return images.get(keyOf(die, lookKey()));
}

/**
 * Draws every die of `dice` whose image is missing, then resolves. Dice of the
 * same sides and colour are drawn once.
 */
export async function drawDieImages(dice: readonly DieImageRequest[], doc: Document = getDomHost().activeDocument()): Promise<void> {
  await loadDiceArtwork(activeLook().font);
  const look = lookKey();
  const missing = new Map<string, DieImageRequest>();
  for (const die of dice) {
    const key = keyOf(die, look);
    if (!images.has(key)) missing.set(key, die);
  }
  if (missing.size === 0) return;

  const lease = borrowStage(doc);
  try {
    const renderer = lease.renderer;
    const win = doc.defaultView;
    const ratio = win ? stagePixelRatio(win) : 1;
    for (const [key, { sides, colour }] of missing) {
      const scene = sceneFromRolls([{ max: sides, value: sides, ...(colour !== undefined && { colour }) }]);
      if (!renderer || !scene) {
        keep(key, null);
        continue;
      }
      const { offsets, radius } = layoutDice(scene.plan.length);
      const frame = restingFrame(offsets, radius);
      renderer.setSize(Math.round(DIE_IMAGE_SIZE * frame.aspect), DIE_IMAGE_SIZE, ratio, 0.5, frame.halfWidth);
      renderer.setPlan(scene.plan);
      const random = seededRandom(sides);
      const staged = scene.plan.map((plan, i): StageDie => {
        const geometry = dieGeometry(plan.sides);
        const anim = makeDie(random, offsets[i], radius, renderer.stage(), lyingHeight(geometry));
        restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, scene.faces[i]!), REST_YAW / 2));
        return { anim, sides: plan.sides };
      });
      renderer.render(staged, 1);
      // Read back in the same task as the render: the drawing buffer is not kept.
      keep(key, { url: lease.canvas.toDataURL('image/png'), aspect: frame.aspect });
    }
  } finally {
    returnStage(lease);
  }
}
