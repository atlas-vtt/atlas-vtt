import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TextElement } from '../types';
import { textBackground, textFontStyle, textFontWeight, textRotation, textScale } from './textBoxLayout';

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
    fontWeight: textFontWeight(element),
    fontStyle: textFontStyle(element),
  });
}

function drawBackground(background: Graphics, text: Text, element: TextElement): void {
  background.clear();
  const box = textBackground(element, text.getLocalBounds());
  if (!box) return;
  if (box.radius) background.roundRect(box.x, box.y, box.width, box.height, box.radius);
  else background.rect(box.x, box.y, box.width, box.height);
  background.fill({ color: parseInt(box.color.replace('#', ''), 16), alpha: box.alpha });
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
  container.rotation = textRotation(element.rotation);
  container.scale.set(textScale(element.scale));
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

  container.rotation = textRotation(element.rotation);
  container.scale.set(textScale(element.scale));
}
