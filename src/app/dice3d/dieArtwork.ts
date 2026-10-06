import { getDomHost } from '../host/dom';
/**
 * The faces of the dice: cut from card stock and lettered in pencil.
 *
 * A computed wood grain used to live here: fractal growth rings in the albedo,
 * the same strokes as grooves in the relief, numerals from `fillText` in gold
 * with a darker rim. It looked expensive and was the only thing on the sheet
 * that came out of a drawing program; next to it every glyph, every card and
 * the title itself is a pencil stroke.
 *
 * Both now come baked (`tools/pencil-die-faces.mjs` in the original project):
 * the numerals as drawings on the same net as everything else, the ground as a
 * cut from the same paper layer that lies under the whole sheet. The only thing
 * computed here is **which numeral goes into which cell**.
 *
 * The images arrive later: until they do, the body shows the bare card tone,
 * and `dieAssets` redraws the faces once they are there.
 */

import * as THREE from 'three';

import CARD_URL from '../assets/dice3d/card.webp?inline';
import { CELL, atlasLayout } from './atlasCell';
import type { DiceFont } from './diceLook';
import { dieGeometry, type DieSides } from './dieGeometry';
import { loadImage, loadNumerals, numeralsReady, paintNumeral } from './dieNumerals';
import { activeLook, paintCard, paintWear } from './dieSkin';

let cardStock: HTMLImageElement | null = null;
let cardPending: Promise<void> | null = null;

/** Whether faces painted now would have their card stock and the numerals of `font`. */
export function diceArtworkReady(font: DiceFont): boolean {
  return cardStock !== null && numeralsReady(font);
}

/**
 * Fetches the card stock and the numeral sheet of a font, once each, in the
 * background. If it fails the die stays a piece of card without numbers: ugly,
 * but it does not hold up the throw.
 */
export function loadDiceArtwork(font: DiceFont = activeLook().font): Promise<void> {
  cardPending ??= loadImage(CARD_URL)
    .then((card) => {
      cardStock = card;
    })
    .catch(() => undefined);
  return Promise.all([cardPending, loadNumerals(font)]).then(() => undefined);
}

/**
 * Paints the numerals of a body into a drawing atlas. `paint` gets the cell
 * centre in pixels per face and paints ground and numeral; the last cell stays
 * the blank ground for chamfers and corners.
 */
export function drawAtlas(
  sides: DieSides,
  paint: (ctx: CanvasRenderingContext2D, cell: { x: number; y: number; value: number | null }) => void,
): HTMLCanvasElement {
  const { cols, rows } = atlasLayout(sides);
  const canvas = getDomHost().createCanvas();
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return canvas;
  const values = dieGeometry(sides).values;
  for (let i = 0; i <= sides; i++) {
    const x = (i % cols) * CELL + CELL / 2;
    const y = Math.floor(i / cols) * CELL + CELL / 2;
    ctx.save();
    paint(ctx, { x, y, value: i < sides ? values[i]! : null });
    ctx.restore();
  }
  return canvas;
}

export interface DieTextures {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  redraw: () => void;
}

/**
 * The atlas of a body: one cell per face holding card and numeral. The last
 * cell stays bare card; it carries the chamfers and corners.
 *
 * Plus a relief. It comes from **the same two images**: the paper's grain is
 * the tooth, and where graphite lies it lies *in* the tooth, a touch deeper.
 * Randomised separately, the relief would look like scratches on a photo of
 * paper.
 */
export function buildTextures(sides: DieSides): DieTextures {
  // Read at every redraw, so a new look reaches the faces with `refreshDieArtwork`.
  const albedo = (look = activeLook()): HTMLCanvasElement =>
    drawAtlas(sides, (ctx, { x, y, value }) => {
      paintCard(ctx, x, y, sides * 31 + (value ?? 0) * 7 + 5, cardStock, look);
      paintWear(ctx, x, y, value === null, look);
      if (value !== null) paintNumeral(ctx, x, y, sides, value, look.font, look.ink);
    });

  const bump = (look = activeLook()): HTMLCanvasElement =>
    drawAtlas(sides, (ctx, { x, y, value }) => {
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.filter = 'grayscale(1) contrast(2.1)';
      paintCard(ctx, x, y, sides * 31 + (value ?? 0) * 7 + 5, cardStock, look);
      ctx.restore();
      if (value === null) return;
      ctx.save();
      ctx.globalAlpha = 0.7;
      // The relief always takes the numeral dark: it is cut into the face whatever its colour.
      paintNumeral(ctx, x, y, sides, value, look.font, null);
      ctx.restore();
    });

  const textures = {
    map: new THREE.CanvasTexture(albedo()),
    bumpMap: new THREE.CanvasTexture(bump()),
  };
  textures.map.colorSpace = THREE.SRGBColorSpace;
  for (const tex of Object.values(textures)) tex.anisotropy = 4;

  return {
    ...textures,
    redraw: (): void => {
      textures.map.image = albedo();
      textures.bumpMap.image = bump();
      for (const tex of Object.values(textures)) tex.needsUpdate = true;
    },
  };
}
