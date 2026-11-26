import { getDomHost } from '../host/dom';
import { SerialLock } from '../utils/serialLock';
import { COLOUR_PRESETS } from '../appearance/colourPresets';
import { DICE_COLOUR_OPTIONS, DICE_FONT_OPTIONS, parseHex, type DiceColour, type DiceFont, type Rgb } from './diceLook';
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
/** How far a channel of the accent may be off a preset's and still be that preset (see `asPreset`). */
const PRESET_SLACK = 3;

/**
 * A d20 in every colour of one font as image URLs, and the ring that marks the
 * chosen one (the same die in every colour). Always whole: a strip shows a set
 * or none, never dice arriving one by one.
 */
export interface DicePreviews {
  images: Record<DiceColour, string>;
  ring: string;
}

/**
 * Who asks for previews: a panel that shows them now, a page that will show them
 * soon (the welcome wizard, which may build the document's first stage for them),
 * or a warm-up that renders them only into a stage that waits anyway.
 */
export type PreviewRequest = 'shown' | 'soon' | 'ifStage';

/**
 * Previews are kept for the session, by the colours they show, for both fonts:
 * a panel opens with them and a change of look swaps the set. Rendering one is
 * a frame read back from the graphics card, some twenty milliseconds. The
 * accent die shares the image of the preset that has its colour.
 */
const images = new Map<string, string>();
let ring: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const lock = new SerialLock();
/** Fonts a shown panel waits for: their dice take the next frame instead of an idle moment. */
const shownFonts = new Map<DiceFont, number>();
let wakeIdleWait: (() => void) | null = null;

function keyOf(look: ResolvedLook): string {
  return `${look.font} ${look.body ?? '-'} ${look.ink ?? '-'}`;
}

/**
 * The preset `accent` is, where it is one. Obsidian keeps the accent as whole
 * HSL values, so a preset picked as the accent comes back a unit off in a
 * channel (Teal's #2a9d8f as #2a9d90): taken as it is, the accent die would miss
 * the image of the preset it is and render again.
 */
function asPreset(accent: Rgb | null): Rgb | null {
  if (accent === null) return null;
  for (const { hex } of COLOUR_PRESETS) {
    const preset = parseHex(hex);
    if (preset && preset.every((channel, i) => Math.abs(channel - accent[i]!) <= PRESET_SLACK)) return preset;
  }
  return accent;
}

function looksOf(font: DiceFont, doc: Document): ResolvedLook[] {
  const accent = asPreset(readAccent(doc));
  return DICE_COLOUR_OPTIONS.map(({ value }) => resolveLook({ colour: value, font }, accent));
}

/** The set of `font`, the accent die in the accent colour of `doc`; null until every die of it is rendered. */
export function cachedDicePreviews(font: DiceFont, doc: Document = getDomHost().activeDocument()): DicePreviews | null {
  if (ring === null) return null;
  const set: Partial<Record<DiceColour, string>> = {};
  for (const look of looksOf(font, doc)) {
    const url = images.get(keyOf(look));
    if (!url) return null;
    set[look.colour] = url;
  }
  return { images: set as Record<DiceColour, string>, ring };
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
 * The browser's turn before the next die of `font`: a painted frame while a
 * panel shows that font, an idle moment otherwise. A panel that opens
 * meanwhile wakes a warm-up's wait.
 */
function turn(font: DiceFont): Promise<void> {
  // The main window's timers, as in `workSlices`: a pop-out that closes drops its own, and the fill would never end.
  if ((shownFonts.get(font) ?? 0) > 0 || typeof window.requestIdleCallback !== 'function') return afterPaint(window);
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

/** Resolves once `url` is decoded, so the set it completes shows in one frame, every die at once. */
async function decoded(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  await image.decode().catch(() => undefined);
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

async function fill(fonts: readonly DiceFont[], doc: Document, request: PreviewRequest): Promise<void> {
  await Promise.all(fonts.map((font) => loadDiceArtwork(font)));
  const pending = (): ResolvedLook[] => fonts.flatMap((font) => looksOf(font, doc)).filter((look) => !images.has(keyOf(look)));
  // A warm-up uses a stage that waits anyway; it builds no WebGL context for dice nobody may look at.
  if ((ring !== null && pending().length === 0) || (request === 'ifStage' && !hasIdleStage(doc))) return;
  let lease: StageLease | null = null;
  try {
    // The first die waits a turn too: a panel opened by a click paints before its effects' work is done.
    await turn(fonts[0]!);
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
    }
    for (let next = pending()[0]; next; next = pending()[0]) {
      await turn(next.font);
      // The context can be lost between two dice; the panel asks again when it opens.
      if (!canShowDice(doc)) return;
      const url = paint(renderer, canvas, anim, next);
      await decoded(url);
      images.set(keyOf(next), url);
      published();
    }
  } finally {
    lease?.renderer?.setShadowShown(true);
    if (lease) returnStage(lease);
  }
}

/**
 * Renders the d20s not kept yet, `font`'s first and then the other font's, so a
 * change of look finds its set: one die per turn of the browser, so neither a
 * panel's opening nor its scrolling waits on them.
 */
export function fillDicePreviews(font: DiceFont, request: PreviewRequest, doc: Document = getDomHost().activeDocument()): Promise<void> {
  const fonts = [font, ...DICE_FONT_OPTIONS.map((option) => option.value).filter((other) => other !== font)];
  if (request === 'shown') {
    shownFonts.set(font, (shownFonts.get(font) ?? 0) + 1);
    wakeIdleWait?.();
  }
  return lock.run(() => fill(fonts, doc, request)).finally(() => {
    if (request === 'shown') shownFonts.set(font, (shownFonts.get(font) ?? 1) - 1);
  });
}
