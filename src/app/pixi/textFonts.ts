/**
 * The bundled faces of map texts, loaded before a text is measured or drawn in them. A canvas
 * that is asked for a face it has not loaded measures and draws a stand-in, and PIXI keeps what
 * it measured, so a text set too early would stay wrong: `textFontReady` is asked first, and
 * whoever draws texts hears through `watchTextFonts` when a face has arrived.
 *
 * The faces are those the stylesheet declares (`@font-face`); a page that declares none of them
 * draws in what it has.
 */

import { bundledFamily, cssFont, type TextFace } from '../annotations/textLook';

/** What of a document's fonts (`document.fonts`) the loading needs. */
export interface FontSource {
  check(font: string): boolean;
  load(font: string): Promise<unknown>;
}

interface Watch {
  /** The fonts of the document the canvas is in and, where that is another, of the one texts are measured in. */
  readonly sources: readonly FontSource[];
  readonly arrived: () => void;
}

const watches = new Set<Watch>();
/** The bundled families that can be drawn: loaded, or found to be none the page declares. */
const settled = new Set<string>();
const loading = new Set<string>();

/** The size the faces are asked for at: a face is one file, whatever its size. */
const PROBE: Omit<TextFace, 'fontFamily'> = { fontSize: 16, bold: false, italic: false };

function settle(family: string): void {
  loading.delete(family);
  if (settled.has(family)) return;
  settled.add(family);
  for (const watch of [...watches]) watch.arrived();
}

/**
 * Whether a text in `fontFamily` can be measured and drawn now. A bundled face that is not loaded
 * yet is asked for, in every document that is watched; `watchTextFonts` tells when it is there.
 * Where nobody watches (no document whose fonts could load) every face counts as there.
 */
export function textFontReady(fontFamily: string): boolean {
  const family = bundledFamily(fontFamily);
  if (family === null || settled.has(family) || watches.size === 0) return true;
  const font = cssFont({ ...PROBE, fontFamily: family });
  const sources = [...watches].flatMap((watch) => watch.sources);
  if (sources.every((source) => source.check(font))) {
    settled.add(family);
    return true;
  }
  if (!loading.has(family)) {
    loading.add(family);
    // A face that fails to load is drawn in what the device has, as one the page never declared.
    void Promise.allSettled(sources.map((source) => source.load(font))).then(() => settle(family));
  }
  return false;
}

/**
 * Loads the bundled faces from `source` when a text asks for them, and calls `arrived` whenever
 * one has become ready, until the returned function is called.
 *
 * `source` is the fonts of the document the canvas is in. A text is measured on a canvas of the
 * document PIXI was loaded in, which is another one for a canvas in a second window: hand its
 * fonts in as `measured`, and a face counts as there only once both have it. Faces found ready
 * for other documents are asked for again.
 */
export function watchTextFonts(source: FontSource, arrived: () => void, measured?: FontSource | null): () => void {
  const watch: Watch = { sources: measured && measured !== source ? [source, measured] : [source], arrived };
  const known = new Set([...watches].flatMap((other) => other.sources));
  if (watch.sources.some((one) => !known.has(one))) settled.clear();
  watches.add(watch);
  return (): void => {
    watches.delete(watch);
  };
}
