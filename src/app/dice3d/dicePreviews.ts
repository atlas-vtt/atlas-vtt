import { getDomHost } from '../host/dom';
import { SerialLock } from '../utils/serialLock';
import { DICE_COLOUR_OPTIONS, type DiceColour, type DiceFont } from './diceLook';
import { readAccent } from './diceLookRuntime';
import { layoutDice, restingFrame } from './diceScene';
import { loadDiceArtwork } from './dieArtwork';
import { dieGeometry, faceIndexForValue, lyingHeight, REST_YAW, restingQuaternion } from './dieGeometry';
import { refreshDieArtwork } from './dieMesh';
import { copyCanvas, outlineRing } from './dieOutline';
import { makeDie, restImmediately, type DieAnim } from './dieMotion';
import { activeLook, resolveLook, setActiveLook, type ResolvedLook } from './dieSkin';
import type { DiceRenderer } from './DiceRenderer';
import { borrowStage, canShowDice, hasIdleStage, returnStage, type StageLease } from './stagePool';

/** Pixel size of a preview; shown at half that. */
const PREVIEW_PX = 192;
/** The chosen die's ring, in preview pixels: how far off the die's edge it stands, and how wide it is. */
const RING_GAP = 4;
const RING_WIDTH = 3;
/** How long a warm-up waits for an idle moment before it takes one. */
const IDLE_PATIENCE_MS = 1000;
/** How long a die waits for a frame that may not come. */
const PAINT_PATIENCE_MS = 100;

/** A d20 per colour as image URLs, and the ring that marks the chosen one (the same die in every colour). */
export interface DicePreviews {
  images: Partial<Record<DiceColour, string>>;
  ring: string | null;
}

/**
 * Previews are kept for the session, by the colours they show. Rendering one is
 * a frame read back from the graphics card, some twenty milliseconds; the whole
 * strip on every open of a panel was a quarter second before the panel showed.
 * The accent die shares the image of the preset that has its colour.
 */
const images = new Map<string, string>();
let ring: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const lock = new SerialLock();
/** Fills that a shown panel waits for; while there are any, a fill takes the browser's next turn instead of idle time. */
let shownFills = 0;
let wakeIdleWait: (() => void) | null = null;

function keyOf(look: ResolvedLook): string {
  return `${look.font} ${look.body ?? '-'} ${look.ink ?? '-'}`;
}

function looksOf(font: DiceFont, doc: Document): ResolvedLook[] {
  const accent = readAccent(doc);
  return DICE_COLOUR_OPTIONS.map(({ value }) => resolveLook({ colour: value, font }, accent));
}

/** The previews of `font` rendered so far, the accent die in the accent colour of `doc`. */
export function cachedDicePreviews(font: DiceFont, doc: Document = getDomHost().activeDocument()): DicePreviews {
  const previews: DicePreviews = { images: {}, ring };
  for (const look of looksOf(font, doc)) {
    const url = images.get(keyOf(look));
    if (url) previews.images[look.colour] = url;
  }
  return previews;
}

/** Calls `listener` whenever a preview was added; returns the unsubscribe. */
export function subscribeDicePreviews(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => { listeners.delete(listener); };
}

/** Counts the previews added, so a view knows when to read `cachedDicePreviews` again. */
export function dicePreviewsVersion(): number {
  return version;
}

function published(): void {
  version++;
  for (const listener of listeners) listener();
}

/**
 * After the next frame is painted. Not `scheduler.yield`: in Obsidian its
 * continuation ran ahead of the frame, so a clicked panel still waited for its
 * first die, and the dice after it kept the window from painting until the last.
 * The timer stands in where no frame comes (a hidden window).
 */
function afterPaint(win: Window): Promise<void> {
  return new Promise((resolve) => {
    const fallback = win.setTimeout(resolve, PAINT_PATIENCE_MS);
    win.requestAnimationFrame(() => {
      win.clearTimeout(fallback);
      win.setTimeout(resolve, 0);
    });
  });
}

/**
 * The browser's turn before the next die: a painted frame while a panel shows
 * the dice, an idle moment while a warm-up renders them ahead. A panel that
 * opens meanwhile wakes a warm-up's wait.
 */
function turn(): Promise<void> {
  // The main window's timers, as in `workSlices`: a pop-out that closes drops its own, and the fill would never end.
  if (shownFills > 0 || typeof window.requestIdleCallback !== 'function') return afterPaint(window);
  return new Promise((resolve) => {
    const handle = window.requestIdleCallback(() => done(), { timeout: IDLE_PATIENCE_MS });
    function done(): void {
      window.cancelIdleCallback(handle);
      wakeIdleWait = null;
      resolve();
    }
    wakeIdleWait = done;
  });
}

/** One die in `look`, read back as an image URL; the look every other die is drawn with is restored. */
function paint(renderer: DiceRenderer, canvas: HTMLCanvasElement, anim: DieAnim, look: ResolvedLook): string {
  const previous = activeLook();
  try {
    setActiveLook(look);
    refreshDieArtwork(20);
    renderer.render([{ anim, sides: 20 }], 1);
    // Read back in the same task as the render: the drawing buffer is not kept.
    return canvas.toDataURL('image/png');
  } finally {
    setActiveLook(previous);
    // Only the d20 was repainted for the preview.
    refreshDieArtwork(20);
  }
}

function posedDie(renderer: DiceRenderer): DieAnim {
  const { offsets, radius } = layoutDice(1);
  renderer.setSize(PREVIEW_PX, PREVIEW_PX, 1, 0.5, restingFrame(offsets, radius).halfWidth);
  renderer.setPlan([{ sides: 20 }]);
  const geometry = dieGeometry(20);
  const anim = makeDie(Math.random, offsets[0], radius, renderer.stage(), lyingHeight(geometry));
  restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, 20), REST_YAW / 2));
  return anim;
}

async function fill(font: DiceFont, doc: Document, shown: boolean): Promise<void> {
  await loadDiceArtwork(font);
  const pending = (): ResolvedLook[] => looksOf(font, doc).filter((look) => !images.has(keyOf(look)));
  // A warm-up uses a stage that waits anyway; it builds no WebGL context for dice nobody may look at.
  if ((ring !== null && pending().length === 0) || (!shown && !hasIdleStage(doc))) return;
  let lease: StageLease | null = null;
  try {
    // The first die waits a turn too: a panel opened by a click paints before its effects' work is done.
    await turn();
    lease = borrowStage(doc);
    const { renderer, canvas } = lease;
    // A lost context reads back blank dice, which would be kept for the session.
    if (!renderer || !canShowDice(doc)) return;
    const anim = posedDie(renderer);
    if (ring === null) {
      // The die alone, without its shadow on the table: its outline is the ring's.
      renderer.setShadowShown(false);
      renderer.render([{ anim, sides: 20 }], 1);
      renderer.setShadowShown(true);
      ring = outlineRing(copyCanvas(canvas), RING_GAP, RING_WIDTH);
      published();
    }
    for (let next = pending()[0]; next; next = pending()[0]) {
      await turn();
      images.set(keyOf(next), paint(renderer, canvas, anim, next));
      published();
    }
  } finally {
    lease?.renderer?.setShadowShown(true);
    if (lease) returnStage(lease);
  }
}

/**
 * Renders the d20s of `font` that are not kept yet, one per turn of the browser,
 * so neither a panel's opening nor its scrolling waits on them. `shown`: a panel
 * shows them now, rather than a warm-up rendering them ahead.
 */
export function fillDicePreviews(font: DiceFont, shown: boolean, doc: Document = getDomHost().activeDocument()): Promise<void> {
  if (shown) {
    shownFills++;
    wakeIdleWait?.();
  }
  return lock.run(() => fill(font, doc, shown)).finally(() => {
    if (shown) shownFills--;
  });
}
