import { CanvasTextMetrics, Container, Graphics, Text, type TextStyle } from 'pixi.js';
import type { TextAnnotation } from '../annotations/annotationTypes';
import { bundledFamily, haloOf, type TextHalo } from '../annotations/textLook';
import type { Point } from '../types/visionTypes';
import { plateReach, textLayout, wordStyle, type TextLayout } from './textLayout';

/** The label of a text's background drawing within its view. */
export const TEXT_BACKGROUND_LABEL = 'textBackground';
/** The label of a text's characters within its view. */
export const TEXT_CONTENT_LABEL = 'textContent';

/**
 * Room around the letters in their picture, as a share of the font size: PIXI sizes the picture
 * by a few tall and deep letters, and a display face's swashes and a slanted letter's top reach
 * past them. Texts made before there were faces and looks keep the picture they had.
 */
const PICTURE_ROOM = 0.2;

interface Drawn {
  text: TextAnnotation;
  /** The halo is drawn: an Outline text that is large enough on the pictures that show it. */
  halo: boolean;
}

/** What each view was last drawn from. */
const drawn = new WeakMap<Container, Drawn>();

const haloFor = (text: TextAnnotation, shown: boolean): TextHalo | null => (shown && text.look === 'outline' ? haloOf(text.color, text.fontSize) : null);

function styleOf(text: TextAnnotation, halo: TextHalo | null): TextStyle {
  const style = wordStyle(text);
  if (halo) style.stroke = { color: halo.color, alpha: halo.alpha, width: halo.width, join: 'round' };
  if (text.look === 'outline' || bundledFamily(text.fontFamily) !== null) style.padding = Math.ceil(text.fontSize * PICTURE_ROOM);
  return style;
}

/**
 * Sets the words of `text` into `words`: its lines, and where they stand in the box of its layout.
 * A text as wide as its words is centred on its place; one with a width stands at the side of its
 * box that its alignment names. A halo widens the picture by half its line on every side, and the
 * letters stay where they are without it.
 */
function setWords(words: Text, text: TextAnnotation, layout: TextLayout, halo: TextHalo | null): void {
  words.text = layout.lines.join('\n');
  words.style = styleOf(text, halo);
  const side = sideOf(text);
  words.anchor.set((side + 1) / 2, 0.5);
  words.position.set(side * (layout.width + (halo?.width ?? 0)) / 2, 0);
}

/** The side of its box a text's words stand at: -1 the left, 1 the right, 0 the middle, where a text as wide as its words always stands. */
const sideOf = (text: TextAnnotation): -1 | 0 | 1 => (text.width === null || text.align === 'center' ? 0 : text.align === 'left' ? -1 : 1);

/**
 * How far the letters of `text` stand from where its layout puts them, in its own units. PIXI
 * draws a text into a picture of whole pixels and hangs the picture by its anchor, so the letters
 * lie up to half a unit higher, and by their alignment up to one unit further left, than the
 * sum says. Whoever lays something on the letters (the field a text is typed in) adds this.
 */
export function wordsOffset(text: TextAnnotation, layout: TextLayout): Point {
  const style = styleOf(text, haloFor(text, true));
  const picture = CanvasTextMetrics.measureText(layout.lines.join('\n'), style);
  const room = 2 * style.padding;
  const spare = (size: number): number => Math.ceil(Math.max(1, size) + room) - (size + room);
  return { x: (-(sideOf(text) + 1) / 2) * spare(picture.width), y: -spare(picture.height) / 2 };
}

function drawBackground(background: Graphics, text: TextAnnotation, layout: TextLayout): void {
  background.clear();
  if (text.backgroundColor === null) return;
  const reach = plateReach(text);
  const x = -layout.width / 2 - reach;
  const y = -layout.height / 2 - reach;
  const width = layout.width + reach * 2;
  const height = layout.height + reach * 2;
  if (text.borderRadius) background.roundRect(x, y, width, height, text.borderRadius);
  else background.rect(x, y, width, height);
  background.fill({ color: parseInt(text.backgroundColor.replace('#', ''), 16), alpha: text.opacity });
}

/**
 * A text on the map as it is drawn: its plate and its characters, centred on its place, turned
 * and scaled. Make it only once the text's face is ready (`textFontReady`).
 */
export function createTextElementView(text: TextAnnotation): Container {
  const container = new Container({ label: text.id, sortableChildren: true });
  container.addChild(new Graphics({ label: TEXT_BACKGROUND_LABEL }));
  const words = new Text({ text: '' });
  words.label = TEXT_CONTENT_LABEL;
  container.addChild(words);
  drawn.set(container, { text, halo: true });
  updateTextElementView(container, text);
  return container;
}

/** Brings a view made by `createTextElementView` up to date with its edited text. Whether its halo is drawn stays as it was. */
export function updateTextElementView(container: Container, text: TextAnnotation): void {
  const state = drawn.get(container) ?? { text, halo: true };
  state.text = text;
  drawn.set(container, state);
  const layout = textLayout(text);
  const words = container.getChildByLabel(TEXT_CONTENT_LABEL) as Text | null;
  if (words) setWords(words, text, layout, haloFor(text, state.halo));
  const background = container.getChildByLabel(TEXT_BACKGROUND_LABEL) as Graphics | null;
  if (background) drawBackground(background, text, layout);
  placeTextElementView(container, text);
}

/** Puts a view made by `createTextElementView` where `place` says, turned and scaled so: its words and look stay as they are drawn. */
export function placeTextElementView(container: Container, place: Pick<TextAnnotation, 'x' | 'y' | 'rotation' | 'scale'>): void {
  container.position.set(place.x, place.y);
  container.rotation = (place.rotation * Math.PI) / 180;
  container.scale.set(place.scale);
}

/**
 * Draws the halo of the Outline text in `container`, or leaves it out: a text too small on every
 * picture that shows it carries none (`carriesHalo`). Nothing for a text of another look, or one
 * whose halo is already so.
 */
export function showTextHalo(container: Container, shown: boolean): void {
  const state = drawn.get(container);
  if (!state || state.halo === shown) return;
  state.halo = shown;
  if (state.text.look !== 'outline') return;
  const words = container.getChildByLabel(TEXT_CONTENT_LABEL) as Text | null;
  if (words) setWords(words, state.text, textLayout(state.text), haloFor(state.text, shown));
}

/** The font size of the text `container` shows, in its own units; null for a view this module did not make. */
export function textViewFontSize(container: Container): number | null {
  return drawn.get(container)?.text.fontSize ?? null;
}
