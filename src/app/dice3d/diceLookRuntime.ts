import { getDomHost } from '../host/dom';
/**
 * Puts a dice look into effect. The look is global: every die in every window
 * is painted with it; `dicePreviews` shows what each colour looks like.
 */

import { parseHex, type DiceLook, type Rgb } from './diceLook';
import { loadDiceArtwork } from './dieArtwork';
import { refreshDieArtwork } from './dieMesh';
import { resolveLook, setActiveLook } from './dieSkin';

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
