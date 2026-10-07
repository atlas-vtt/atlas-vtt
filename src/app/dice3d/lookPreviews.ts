/**
 * Previews of the dice looks the GM chooses from: Atlas's own dice in the GM's colour and every
 * registered extension look, as Atlas's dice show them. A look that gives a `preview` image keeps
 * it; one without is rendered from its own face art, a d20 with its 20 up, like the colour previews.
 */

import { getDomHost } from '../host/dom';
import { lookArt } from './customLookArt';
import { customLooks } from './customLooks';
import { layoutDice, restingFrame } from './diceScene';
import { loadDiceArtwork } from './dieArtwork';
import { dieGeometry, faceIndexForValue, lyingHeight, REST_YAW, restingQuaternion } from './dieGeometry';
import type { LookVariant } from './dieMesh';
import { makeDie, restImmediately } from './dieMotion';
import { atlasVariant, customVariant, variantFont } from './lookVariants';
import { borrowStage, returnStage } from './stagePool';

/** Pixel size of a preview; shown at half that. */
const PREVIEW_PX = 144;

/** One d20 per look on one pooled stage, as image URLs by choice (a full look id; `''` for Atlas's dice). */
function renderVariants(variants: ReadonlyMap<string, LookVariant>, doc: Document): Record<string, string> {
  const previews: Record<string, string> = {};
  const lease = borrowStage(doc);
  try {
    const renderer = lease.renderer;
    if (!renderer) return previews;
    const { offsets, radius } = layoutDice(1);
    renderer.setSize(PREVIEW_PX, PREVIEW_PX, 1, 0.5, restingFrame(offsets, radius).halfWidth);
    const geometry = dieGeometry(20);
    const anim = makeDie(Math.random, offsets[0], radius, renderer.stage(), lyingHeight(geometry));
    restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, 20), REST_YAW / 2));
    for (const [value, variant] of variants) {
      renderer.setPlan([20], { look: variant });
      renderer.render([{ anim, sides: 20 }], 1);
      // Read back in the same task as the render: the drawing buffer is not kept.
      previews[value] = lease.canvas.toDataURL('image/png');
    }
  } finally {
    returnStage(lease);
  }
  return previews;
}

/**
 * A preview of every look to choose from, by choice: an extension look's own `preview` where it gives one, else a
 * d20 painted with its art (once that art has loaded, at most 10 s per die type), and Atlas's own dice in the GM's
 * colour. Never rejects: a look whose preview cannot be made has none.
 */
export async function renderLookPreviews(doc: Document = getDomHost().activeDocument()): Promise<Record<string, string>> {
  const previews: Record<string, string> = {};
  try {
    const looks = customLooks();
    const drawn = looks.filter((look) => !look.preview);
    // Every look's art at once: each answers within its own 10 s.
    const [arts] = await Promise.all([Promise.all(drawn.map((look) => lookArt(look))), loadDiceArtwork(variantFont())]);
    const variants = new Map<string, LookVariant>([['', atlasVariant()], ...drawn.map((look, i): [string, LookVariant] => [look.id, customVariant(look, arts[i]!)])]);
    Object.assign(previews, renderVariants(variants, doc));
    for (const look of looks) if (look.preview) previews[look.id] = look.preview;
  } catch (error) {
    console.warn('[Atlas] The dice look previews could not be made:', error);
  }
  return previews;
}
