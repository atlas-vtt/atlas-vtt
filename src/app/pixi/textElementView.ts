import { CanvasTextMetrics, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TextMeasure } from '../annotations/annotationBounds';
import type { TextAnnotation } from '../annotations/annotationTypes';
import type { TextElement } from '../types';

/** The label of a text's background drawing within its view. */
export const TEXT_BACKGROUND_LABEL = 'textBackground';
/** The label of a text's characters within its view. */
export const TEXT_CONTENT_LABEL = 'textContent';

function styleOf(element: TextElement): TextStyle {
  return new TextStyle({
    fontFamily: element.fontFamily,
    fontSize: element.fontSize,
    fill: element.color,
    align: element.align || 'center',
    fontWeight: element.bold ? 'bold' : 'normal',
    fontStyle: element.italic ? 'italic' : 'normal',
  });
}

/** How far a text's plate stands out from its words on every side. */
const platePadding = (element: TextElement): number => element.padding || 8;

function drawBackground(background: Graphics, text: Text, element: TextElement): void {
  background.clear();
  if (!element.backgroundColor) return;

  const padding = platePadding(element);
  const bounds = text.getLocalBounds();
  if (element.borderRadius) {
    background.roundRect(bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2, element.borderRadius);
  } else {
    background.rect(bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2);
  }
  background.fill({
    color: parseInt(element.backgroundColor.replace('#', ''), 16),
    alpha: element.opacity || 1,
  });
}

/** A text on the map as it is drawn: its background and its characters, centred on its place, turned and scaled. */
export function createTextElementView(element: TextElement): Container {
  const container = new Container({ label: element.id, sortableChildren: true });
  container.position.set(element.x, element.y);

  const background = new Graphics({ label: TEXT_BACKGROUND_LABEL });
  container.addChild(background);

  const text = new Text({ text: element.text, style: styleOf(element) });
  text.label = TEXT_CONTENT_LABEL;
  text.anchor.set(0.5);
  container.addChild(text);

  drawBackground(background, text, element);
  if (element.rotation) container.rotation = (element.rotation * Math.PI) / 180;
  if (element.scale) container.scale.set(element.scale);
  return container;
}

/** Brings a view made by `createTextElementView` up to date with its edited text. */
export function updateTextElementView(container: Container, element: TextElement): void {
  container.position.set(element.x, element.y);

  const text = container.getChildByLabel(TEXT_CONTENT_LABEL) as Text | null;
  if (text) {
    text.text = element.text;
    text.style = styleOf(element);
  }

  const background = container.getChildByLabel(TEXT_BACKGROUND_LABEL) as Graphics | null;
  if (background && text) drawBackground(background, text, element);

  container.rotation = element.rotation ? (element.rotation * Math.PI) / 180 : 0;
  container.scale.set(element.scale || 1);
}

/**
 * A read text as the record its view is drawn from: every field as the reader took it, so a text
 * whose file holds something else than a size or a colour is drawn as it is found and framed.
 */
export function textElementOf(text: TextAnnotation): TextElement {
  return {
    id: text.id,
    kind: 'text',
    x: text.x,
    y: text.y,
    text: text.text,
    fontSize: text.fontSize,
    fontFamily: text.fontFamily,
    color: text.color,
    ...(text.backgroundColor !== null && { backgroundColor: text.backgroundColor }),
    padding: text.padding,
    borderRadius: text.borderRadius,
    opacity: text.opacity,
    align: text.align,
    bold: text.bold,
    italic: text.italic,
    rotation: text.rotation,
    scale: text.scale,
  };
}

const sizes = new WeakMap<TextAnnotation, { readonly width: number; readonly height: number }>();

/**
 * The size a text's view has before its scale and turn: its words as they are drawn and, where it
 * has one, its plate around them. One function for every caller, worked out once for each read
 * text: whoever finds, frames or culls texts hands it on as their measure.
 */
export const measureTextView: TextMeasure = (text) => {
  let size = sizes.get(text);
  if (!size) {
    const element = textElementOf(text);
    const words = CanvasTextMetrics.measureText(element.text, styleOf(element));
    const padding = element.backgroundColor ? 2 * platePadding(element) : 0;
    size = { width: words.width + padding, height: words.height + padding };
    sizes.set(text, size);
  }
  return size;
};
