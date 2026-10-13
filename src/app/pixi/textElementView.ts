import { Container, Graphics, Text, TextStyle } from 'pixi.js';
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

function drawBackground(background: Graphics, text: Text, element: TextElement): void {
  background.clear();
  if (!element.backgroundColor) return;

  const padding = element.padding || 8;
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
