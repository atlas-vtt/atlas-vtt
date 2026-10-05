import { getDomHost } from '../host/dom';
import { DiceGpu } from './DiceGpu';
import { DiceRenderer, stagePixelRatio } from './DiceRenderer';
import { DIE_BODIES } from './diceScene';
import { loadDiceArtwork } from './dieArtwork';
import { makeDie } from './dieMotion';

/**
 * **The pool of stages: why the app survives many throws.**
 *
 * One WebGL context per throw sounds clean and was the most expensive line of
 * the whole application: the browser keeps only a handful at once, and a
 * returned one keeps counting until garbage collection collects it (the
 * measurement is noted at `DiceRenderer.reset`). On a phone the system reloads
 * the page under memory pressure instead of warning.
 *
 * So a document has **one** context (`DiceGpu`), made with its first stage,
 * and stages are borrowed, not built. A stage that leaves clears itself and
 * goes back into the pool; the next one takes it, canvas and all. The pool
 * therefore never grows beyond the number of stages that were ever on screen
 * at the same time (plus those fading out).
 *
 * **And it lives in its own module, not with the stage component**, so a hot
 * reload of the component does not drop it and pile up exactly the contexts
 * this is about. What the module holds is given back when Atlas unloads
 * (`releaseStagePools`) and when a window closes (`releaseStagePool`): a
 * context nobody gives back outlives the plugin that made it.
 *
 * Atlas can show dice in the main window and in a pop-out window. A canvas and
 * its context belong to one document, so there is one pool per document.
 */

/** A stage's canvas and what draws on it. `renderer` is null where there is no WebGL. */
export interface StageLease {
  canvas: HTMLCanvasElement;
  renderer: DiceRenderer | null;
}

/** What a document holds of the dice. */
interface DocumentDice {
  /** Undefined until the first stage asks for it; null where the document has no WebGL. */
  gpu: DiceGpu | null | undefined;
  /** The stages waiting for a roll. */
  idle: StageLease[];
  /** How many stages are out on a panel. */
  lent: number;
  /** Whether its stages are being built ahead. */
  warming: boolean;
  /**
   * Whether its context is lost. The browser blocks WebGL for a page whose
   * contexts keep getting lost, so the stages would stay blank (white on some
   * systems) until the context comes back after a GPU reset or sleep.
   */
  lost: boolean;
}

const documents = new Map<Document, DocumentDice>();

function diceOf(doc: Document): DocumentDice {
  let dice = documents.get(doc);
  if (dice === undefined) {
    dice = { gpu: undefined, idle: [], lent: 0, warming: false, lost: false };
    documents.set(doc, dice);
  }
  return dice;
}

function gpuOf(doc: Document, dice: DocumentDice): DiceGpu | null {
  if (dice.gpu !== undefined) return dice.gpu;
  // Adopted before the context is created, so the canvas and its context
  // belong to the document the stages are shown in.
  const canvas = getDomHost().createCanvas(doc);
  canvas.addEventListener('webglcontextlost', (): void => {
    dice.lost = true;
  });
  canvas.addEventListener('webglcontextrestored', (): void => {
    dice.lost = false;
  });
  try {
    dice.gpu = new DiceGpu(canvas);
  } catch {
    // No WebGL (jsdom, a blocked or broken GPU): the math runs, the picture is missing.
    dice.gpu = null;
  }
  return dice.gpu;
}

/**
 * Whether `doc` can show 3D dice: not where its context could not be made or is
 * lost. Its rolls then show as result cards. The context is made here if no
 * stage made it yet, so a roll before the warm-up finds out too.
 */
export function canShowDice(doc: Document): boolean {
  const dice = diceOf(doc);
  return gpuOf(doc, dice) !== null && !dice.lost;
}

function buildStage(doc: Document, dice: DocumentDice): StageLease {
  const gpu = gpuOf(doc, dice);
  const canvas = getDomHost().createCanvas(doc);
  canvas.className = 'atlas-dice-stage__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  return { canvas, renderer: gpu ? new DiceRenderer(gpu, canvas) : null };
}

export function borrowStage(doc: Document): StageLease {
  const dice = diceOf(doc);
  dice.lent++;
  return dice.idle.pop() ?? buildStage(doc, dice);
}

export function returnStage(lease: StageLease): void {
  lease.canvas.remove();
  // A stage of a pool that was given back has nothing to return to.
  const dice = documents.get(lease.canvas.ownerDocument);
  if (dice === undefined) return;
  lease.renderer?.reset();
  dice.lent = Math.max(0, dice.lent - 1);
  dice.idle.push(lease);
}

/** Gives back the context of `doc`, whose window closed. */
export function releaseStagePool(doc: Document): void {
  const dice = documents.get(doc);
  if (dice === undefined) return;
  documents.delete(doc);
  dice.gpu?.dispose();
}

/** Gives back every document's context: Atlas unloads. */
export function releaseStagePools(): void {
  for (const doc of [...documents.keys()]) releaseStagePool(doc);
}

/**
 * **A stage is built before a roll needs it.**
 *
 * The first one takes some fifty to ninety milliseconds: the document's WebGL
 * context, the mirror world, the shaders. On the first roll that was a freeze
 * at the very moment the dice leave the hand, again for the player window. Each
 * further stage makes its shadow map and canvas on its first frame, which the
 * second panel of an attack and its damage would pay mid-throw. So each
 * document gets its stages while nothing rolls: as many as rolls stand at once
 * (`rollStackState`) and one for the roll that fades out as the next arrives.
 */
const WARM_STAGES = 4;
/** The pause before a stage is built, and between two: the map opening has the frames first. */
const WARM_PAUSE_MS = 500;
/** How long a build waits for an idle moment before it takes one. */
const WARM_PATIENCE_MS = 3000;
/**
 * The canvas a stage waits with, in rem: the roll panel's width and more than
 * its height (`dice-roll.scss`), so a panel finds its canvas made
 * (`DiceRenderer.setView`).
 */
const WARM_REM = [21, 24] as const;
/** Fast enough for the smear, whose translucent shader a still die never asks for. */
const WARM_SPIN = [40, 0, 0] as const;

function whenQuiet(doc: Document, run: () => void): void {
  const win = doc.defaultView;
  if (!win) return;
  win.setTimeout(() => {
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(run, { timeout: WARM_PATIENCE_MS });
    else run();
  }, WARM_PAUSE_MS);
}

/**
 * One unseen frame of every body, spinning: after it the shaders are compiled
 * and the artwork is on the graphics card, so the first throw's first frame
 * costs what every other does.
 */
function warmUp(renderer: DiceRenderer, win: Window): void {
  const rem = parseFloat(win.getComputedStyle(win.document.documentElement).fontSize) || 16;
  renderer.setSize(Math.ceil(WARM_REM[0] * rem), Math.ceil(WARM_REM[1] * rem), stagePixelRatio(win));
  renderer.setPlan(DIE_BODIES);
  renderer.render(DIE_BODIES.map((sides) => ({ sides, anim: { ...makeDie(Math.random), w: [...WARM_SPIN] } })), 0);
  renderer.reset();
}

function warmNext(doc: Document, dice: DocumentDice): void {
  // The pool was given back meanwhile: nothing is built for it any more.
  if (documents.get(doc) !== dice) return;
  if (dice.idle.length + dice.lent >= WARM_STAGES) return;
  // Dice are on a stage: building now would be the freeze this is here to avoid.
  if (dice.lent === 0) {
    const stage = buildStage(doc, dice);
    if (stage.renderer && doc.defaultView) warmUp(stage.renderer, doc.defaultView);
    dice.idle.push(stage);
  }
  whenQuiet(doc, () => warmNext(doc, dice));
}

/**
 * Builds the stages of `doc` ahead, one per quiet moment and none while dice
 * are rolling. `artwork` is what the warm-up frame draws: without the numerals
 * and the card it would put blank faces on the graphics card.
 */
export function warmStages(doc: Document, artwork: Promise<void> = loadDiceArtwork()): void {
  const dice = diceOf(doc);
  if (dice.warming) return;
  dice.warming = true;
  void artwork.then(() => whenQuiet(doc, () => warmNext(doc, dice)));
}
