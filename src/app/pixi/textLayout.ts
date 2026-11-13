/**
 * How a map text is set: its lines, the box of its words, and where its letters stand in it. One
 * place works it out, so the map, the handles, the eraser and the field a text is typed in agree.
 * Measured with a canvas, in the text's own face and size; a face that has not loaded yet is never
 * measured (`textFontReady`), and a text in it is given a guessed size until it has.
 */

import { CanvasTextMetrics, DOMAdapter, TextStyle } from 'pixi.js';
import { guessedTextSize, type TextMeasure } from '../annotations/annotationBounds';
import type { TextAnnotation } from '../annotations/annotationTypes';
import { cssFont, type TextFace } from '../annotations/textLook';
import { linesOf, wrapBreaks, type RunMeasure } from '../annotations/textWrap';
import { textFontReady } from './textFonts';

/** A text as it is set, before its scale and turn, in its own units (world pixels at scale 1). */
export interface TextLayout {
  /** Its lines as they are drawn. */
  readonly lines: readonly string[];
  /** The box of its words: as wide as they wrap at, or as its widest line. */
  readonly width: number;
  readonly height: number;
  /** From one line's top to the next line's. */
  readonly lineHeight: number;
  /** From a line's top to the line its letters stand on. */
  readonly ascent: number;
}

/** How wide a letter is guessed where no canvas can measure, as a share of the font size. */
const GUESSED_LETTER = 0.6;

type MeasureContext = { font: string; measureText(text: string): { width: number } };
let context: MeasureContext | null | undefined;
let contextFont = '';

function measureContext(): MeasureContext | null {
  if (context === undefined) context = DOMAdapter.get().createCanvas(1, 1).getContext('2d');
  return context;
}

/** Measures runs of text set in `face`: how far each moves the pen. */
export function runMeasure(face: TextFace): RunMeasure {
  const font = cssFont(face);
  return (run) => {
    const canvas = measureContext();
    if (!canvas) return run.length * face.fontSize * GUESSED_LETTER;
    if (contextFont !== font) canvas.font = contextFont = font;
    return canvas.measureText(run).width;
  };
}

/** Where the lines of `text` break at `width` (`wrapBreaks`), measured in its face: what a text with a width saves as its `breaks`. */
export function textBreaks(text: TextAnnotation, width: number): number[] {
  return wrapBreaks(text.text, width, runMeasure(text));
}

/** The style a text's words are measured in and, without a halo, drawn in. */
export function wordStyle(text: TextAnnotation): TextStyle {
  return new TextStyle({
    fontFamily: text.fontFamily,
    fontSize: text.fontSize,
    fill: text.color,
    align: text.align,
    fontWeight: text.bold ? 'bold' : 'normal',
    fontStyle: text.italic ? 'italic' : 'normal',
  });
}

const layouts = new WeakMap<TextAnnotation, TextLayout>();

/**
 * How `text` is set: a text with a width in the lines it saved (`breaks`), or wrapped anew where
 * it saved none; any other in the lines typed into it. Worked out once for each read text. Ask
 * only once its face is ready (`textFontReady`).
 */
export function textLayout(text: TextAnnotation): TextLayout {
  let layout = layouts.get(text);
  if (!layout) {
    const lines = linesOf(text.text, text.width === null ? null : text.breaks ?? textBreaks(text, text.width));
    const metrics = CanvasTextMetrics.measureText(lines.join('\n'), wordStyle(text));
    layout = { lines, width: text.width ?? metrics.width, height: metrics.height, lineHeight: metrics.lineHeight, ascent: metrics.fontProperties.ascent };
    layouts.set(text, layout);
  }
  return layout;
}

/** How far a text's plate stands out from its words on every side; 0 without a plate. */
export function plateReach(text: TextAnnotation): number {
  return text.look === 'plate' ? text.padding : 0;
}

/**
 * The size a text's view has before its scale and turn: its words as they are set and, where it
 * has one, its plate around them. One function for every caller: whoever finds, frames or culls
 * texts hands it on as their measure. A text whose face is still loading has a guessed size.
 */
export const measureTextView: TextMeasure = (text) => {
  if (!textFontReady(text.fontFamily)) return guessedTextSize(text);
  const { width, height } = textLayout(text);
  const plate = 2 * plateReach(text);
  return { width: width + plate, height: height + plate };
};
