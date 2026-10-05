import { getDomHost } from '../host/dom';
/**
 * Puts a dice look into effect and shows what each colour looks like. The look
 * is global: every die in every window is painted with it.
 */

import { DICE_COLOUR_OPTIONS, parseHex, type DiceColour, type DiceFont, type DiceLook, type Rgb } from './diceLook';
import { layoutDice, restingFrame } from './diceScene';
import { loadDiceArtwork } from './dieArtwork';
import { dieGeometry, faceIndexForValue, lyingHeight, REST_YAW, restingQuaternion } from './dieGeometry';
import { refreshDieArtwork } from './dieMesh';
import { makeDie, restImmediately } from './dieMotion';
import { activeLook, resolveLook, setActiveLook } from './dieSkin';
import { borrowStage, returnStage } from './stagePool';

/** Obsidian's accent colour in this document, as channels; null when the theme reports none. */
export function readAccent(doc: Document): Rgb | null {
  const value = getDomHost().ownerWindow(doc).getComputedStyle(doc.body).getPropertyValue('--interactive-accent').trim();
  const ctx = getDomHost().createCanvas().getContext('2d');
  if (!value || !ctx) return null;
  // The canvas normalises any CSS colour (hsl(), names, …) to #rrggbb.
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  return parseHex(String(ctx.fillStyle));
}

let applying = 0;

/** Paints every die with `look` once its artwork is ready; a later call wins over one still loading. */
export async function applyDiceLook(look: DiceLook, doc: Document = getDomHost().activeDocument()): Promise<void> {
  const serial = ++applying;
  await loadDiceArtwork(look.font);
  if (serial !== applying) return;
  setActiveLook(resolveLook(look, readAccent(doc)));
  refreshDieArtwork();
}

/** Pixel size of a preview; shown at half that. */
const PREVIEW_PX = 144;

/**
 * A d20 with its 20 up in each colour and the given font, as image URLs. One
 * pooled stage renders all three; the look is swapped and restored within one
 * task, so no panel ever draws a frame in the wrong colour.
 */
export async function renderDicePreviews(font: DiceFont, doc: Document = getDomHost().activeDocument()): Promise<Partial<Record<DiceColour, string>>> {
  await loadDiceArtwork(font);
  const accent = readAccent(doc);
  const previews: Partial<Record<DiceColour, string>> = {};
  const lease = borrowStage(doc);
  const previous = activeLook();
  try {
    const renderer = lease.renderer;
    if (!renderer) return previews;
    const { offsets, radius } = layoutDice(1);
    renderer.setSize(PREVIEW_PX, PREVIEW_PX, 1, 0.5, restingFrame(offsets, radius).halfWidth);
    renderer.setPlan([20]);
    const geometry = dieGeometry(20);
    const anim = makeDie(Math.random, offsets[0], radius, renderer.stage(), lyingHeight(geometry));
    restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, 20), REST_YAW / 2));
    for (const { value: colour } of DICE_COLOUR_OPTIONS) {
      setActiveLook(resolveLook({ colour, font }, accent));
      refreshDieArtwork(20);
      renderer.render([{ anim, sides: 20 }], 1);
      // Read back in the same task as the render: the drawing buffer is not kept.
      previews[colour] = lease.canvas.toDataURL('image/png');
    }
  } finally {
    setActiveLook(previous);
    // Only the d20 was repainted for the previews.
    refreshDieArtwork(20);
    returnStage(lease);
  }
  return previews;
}
