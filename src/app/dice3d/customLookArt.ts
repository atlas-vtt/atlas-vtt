/**
 * The art of a dice look another plugin added, made ready to paint: asked for once per
 * registration, each face copied into a canvas of Atlas's own no larger than a face cell. A face
 * whose art is missing, fails, arrives late, is too large or would taint the atlas (a cross-origin
 * image without CORS, which WebGL then refuses to upload for every die of its kind) is left out,
 * and Atlas paints its own numeral there: a look never breaks a die. A face with art shows the art
 * and no numeral of Atlas's (`paintFaceMarks`). One console line per look names every face that
 * falls back and why; art that arrives after its 10 s is still taken in and painted (`onLateLookArt`).
 */

import { getDomHost } from '../host/dom';
import { CELL } from './atlasCell';
import { customLooks, type CustomDiceLook, type FaceArtSet, type FaceArtSource } from './customLooks';
import { artKeys, LOOK_BODIES, type DieBody } from './dieBody';
import { loadImage } from './dieNumerals';

/** How long one body's art may take, `faces()` and every image of it together. */
export const LOOK_ART_TIMEOUT_MS = 10_000;
/** The largest side of an image Atlas takes for a face; larger is left out rather than decoded into memory again. */
export const MAX_FACE_IMAGE_SIDE = 8192;

/** Ready art by body and key (`artKeys`). */
export type BodyArt = ReadonlyMap<DieBody, ReadonlyMap<number, HTMLCanvasElement>>;

export interface LookArt {
  faces: BodyArt;
  /** Relief by body and key; a face without it is pressed in from its `faces` art. */
  bump: BodyArt;
}

const loaded = new WeakMap<CustomDiceLook, Promise<LookArt>>();
/** The looks whose loaded art has faces or relief for the d100's tens die. */
const withTensArt = new WeakSet<CustomDiceLook>();

/**
 * True while a registered look's loaded art has the tens die: only then is it a body of its own (`planBody`), so stock
 * Atlas, and a look without tens art, never build and warm a seventh body.
 */
export function registeredLookHasTensArt(): boolean {
  return customLooks().some((look) => withTensArt.has(look));
}

class TimedOut extends Error {}

function within<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.reject(new TimedOut());
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new TimedOut()), left);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

/** The size an image source reports, or null when it reports none. */
function sizeOf(source: CanvasImageSource): { width: number; height: number } | null {
  const any = source as { naturalWidth?: number; naturalHeight?: number; displayWidth?: number; displayHeight?: number; width?: unknown; height?: unknown };
  const width = any.naturalWidth || any.displayWidth || (typeof any.width === 'number' ? any.width : 0);
  const height = any.naturalHeight || any.displayHeight || (typeof any.height === 'number' ? any.height : 0);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

/** Why a face's art could not be taken. */
type FaceProblem = 'failed to load' | 'too large' | 'unreadable (cross-origin without CORS)' | 'not an image' | 'no size';

/** `source` drawn into a canvas of Atlas's own, at most a cell on its longer side; else why it cannot be taken. */
function copyFace(source: CanvasImageSource): HTMLCanvasElement | FaceProblem {
  const size = sizeOf(source);
  if (!size) return 'no size';
  if (size.width > MAX_FACE_IMAGE_SIDE || size.height > MAX_FACE_IMAGE_SIDE) return 'too large';
  const scale = Math.min(1, CELL / Math.max(size.width, size.height));
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const canvas = getDomHost().createCanvas(undefined, { width, height });
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'not an image';
  try {
    ctx.drawImage(source, 0, 0, width, height);
  } catch {
    return 'not an image';
  }
  try {
    // Throws for a tainted canvas: such art would make WebGL refuse the whole atlas.
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    return 'unreadable (cross-origin without CORS)';
  }
  return canvas;
}

/** `source` drawn into a canvas of Atlas's own, at most a cell on its longer side; null when it cannot be taken. */
export function copyFaceImage(source: CanvasImageSource): HTMLCanvasElement | null {
  const copy = copyFace(source);
  return typeof copy === 'string' ? null : copy;
}

async function faceImage(source: FaceArtSource, deadline: number): Promise<HTMLCanvasElement | FaceProblem> {
  if (typeof source === 'string') {
    if (source === '') return 'not an image';
    let image: HTMLImageElement;
    try {
      image = await within(loadImage(source, true), deadline);
    } catch {
      return 'failed to load';
    }
    return copyFace(image);
  }
  if (typeof source !== 'object' || source === null) return 'not an image';
  return copyFace(source);
}

/** Why the faces of a look show Atlas's numeral, gathered into one console line. */
class Fallbacks {
  readonly notGiven: string[] = [];
  readonly unread = new Map<string, string[]>();
  readonly late: string[] = [];
  readonly failed: string[] = [];
  readonly unasked: string[] = [];

  add(body: DieBody, problem: string, key: number): void {
    const list = this.unread.get(problem) ?? [];
    list.push(`d${body} ${key}`);
    this.unread.set(problem, list);
  }

  line(id: string): string | null {
    const parts: string[] = [];
    if (this.notGiven.length) parts.push(`not given: ${this.notGiven.join('; ')}`);
    for (const [problem, faces] of this.unread) parts.push(`${problem}: ${faces.join(', ')}`);
    if (this.failed.length) parts.push(`failed: ${this.failed.join('; ')}`);
    if (this.late.length) parts.push(`no answer within 10 s, painted once it arrives: ${this.late.join(', ')}`);
    if (this.unasked.length) parts.push(`keys Atlas does not ask for, ignored: ${this.unasked.join('; ')}`);
    if (parts.length === 0) return null;
    return `[Atlas] Dice look "${id}": Atlas paints its own numerals on these faces, every other face shows the look's art. ${parts.join('. ')}.`;
  }
}

/** How long Atlas still waits for a body's art that missed its 10 s; it is painted once it arrives. */
export const LATE_LOOK_ART_MS = 120_000;

const lateListeners = new Set<(look: CustomDiceLook) => void>();

/** Hears a look's art for a body arriving after its 10 s, by then in its `LookArt`; returns the stop. */
export function onLateLookArt(listener: (look: CustomDiceLook) => void): () => void {
  lateListeners.add(listener);
  return () => { lateListeners.delete(listener); };
}

/** The faces of one answer, each guarded, into `art`; what falls back is noted in `fallbacks`. */
async function takeFaces(set: unknown, body: DieBody, deadline: number, art: Map<number, HTMLCanvasElement>, fallbacks: Fallbacks): Promise<void> {
  if (typeof set !== 'object' || set === null) {
    fallbacks.failed.push(`d${body}: not a record of images`);
    return;
  }
  const record = set as Record<number, unknown>;
  const keys = artKeys(body);
  const missing: number[] = [];
  await Promise.all(keys.map(async (key) => {
    try {
      // Inside the guard: a record can be a Proxy whose reads throw.
      if (!Object.hasOwn(record, key)) {
        missing.push(key);
        return;
      }
      const canvas = await faceImage(record[key] as FaceArtSource, deadline);
      if (typeof canvas === 'string') fallbacks.add(body, canvas, key);
      else art.set(key, canvas);
    } catch {
      fallbacks.add(body, 'unreadable', key);
    }
  }));
  if (missing.length === keys.length) fallbacks.notGiven.push(`d${body} (all)`);
  else if (missing.length > 0) fallbacks.notGiven.push(`d${body}: ${missing.sort((a, b) => a - b).join(', ')}`);
  try {
    const extra = Object.keys(record).filter((key) => !keys.includes(Number(key)));
    if (extra.length > 0) fallbacks.unasked.push(`d${body}: ${extra.join(', ')}`);
  } catch {
    // A record whose keys cannot be listed has nothing more to say.
  }
}

function tellLate(look: CustomDiceLook): void {
  for (const listener of [...lateListeners]) {
    try {
      listener(look);
    } catch (error) {
      console.error('[Atlas] A dice look listener failed:', error);
    }
  }
}

/**
 * One body's art from `ask`, each face guarded. A body that does not answer within 10 s shows Atlas's numerals
 * meanwhile; an answer that still comes within `LATE_LOOK_ART_MS` is taken in then and `onLateLookArt` told.
 */
async function bodyArt(look: CustomDiceLook, ask: (body: DieBody) => Promise<FaceArtSet>, body: DieBody, fallbacks: Fallbacks): Promise<Map<number, HTMLCanvasElement>> {
  const deadline = Date.now() + LOOK_ART_TIMEOUT_MS;
  const art = new Map<number, HTMLCanvasElement>();
  let answer: Promise<FaceArtSet>;
  try {
    answer = Promise.resolve(ask(body));
  } catch (error) {
    fallbacks.failed.push(`d${body}: ${String(error instanceof Error ? error.message : error)}`);
    return art;
  }
  try {
    await takeFaces(await within(answer, deadline), body, deadline, art, fallbacks);
  } catch (error) {
    if (!(error instanceof TimedOut)) {
      fallbacks.failed.push(`d${body}: ${String(error instanceof Error ? error.message : error)}`);
      return art;
    }
    fallbacks.late.push(`d${body}`);
    void within(answer, Date.now() + LATE_LOOK_ART_MS).then(async (late) => {
      const lateFallbacks = new Fallbacks();
      await takeFaces(late, body, Date.now() + LOOK_ART_TIMEOUT_MS, art, lateFallbacks);
      if (body === 100 && art.size > 0) withTensArt.add(look);
      const line = lateFallbacks.line(look.id);
      if (line) console.warn(`${line} (d${body}, which arrived late)`);
      if (art.size > 0) tellLate(look);
    }, () => undefined);
  }
  return art;
}

async function loadArt(look: CustomDiceLook): Promise<LookArt> {
  const fallbacks = new Fallbacks();
  // Missing relief is pressed in from the face art: no line of its own.
  const reliefFallbacks = new Fallbacks();
  const faces = new Map<DieBody, Map<number, HTMLCanvasElement>>();
  const bump = new Map<DieBody, Map<number, HTMLCanvasElement>>();
  const relief = look.bump;
  // Faces and relief together: each answers within its own 10 s.
  await Promise.all(LOOK_BODIES.flatMap((body) => [
    bodyArt(look, (b) => look.faces(b), body, fallbacks).then((art) => { faces.set(body, art); }),
    ...(relief ? [bodyArt(look, relief, body, reliefFallbacks).then((art) => { bump.set(body, art); })] : []),
  ]));
  const line = fallbacks.line(look.id);
  if (line) console.warn(line);
  if ((faces.get(100)?.size ?? 0) > 0 || (bump.get(100)?.size ?? 0) > 0) withTensArt.add(look);
  return { faces, bump };
}

/** The art of `look`, asked for and loaded once per registration; never rejects. */
export function lookArt(look: CustomDiceLook): Promise<LookArt> {
  let art = loaded.get(look);
  if (!art) {
    // Never rejects, also for what no guard above foresaw: the look then paints Atlas's numerals.
    art = loadArt(look).catch((error: unknown) => {
      console.warn(`[Atlas] Dice look "${look.id}": its art could not be read, so Atlas paints its own numerals.`, error);
      return { faces: new Map(), bump: new Map() };
    });
    loaded.set(look, art);
  }
  return art;
}
