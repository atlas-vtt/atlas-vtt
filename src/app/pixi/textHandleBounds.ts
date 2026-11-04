import type { Viewport } from 'pixi-viewport';
import type { TextElement } from '../types';

/** A text's extent in its handles' frame: the text's position and rotation, with its scale applied. */
export interface TextHandleBounds {
  left: number;
  right: number;
  top: number;
}

/**
 * Where a text's handles must stay clear of. Local bounds leave out the view's
 * own scale, so it is applied here; `text.scale` is passed rather than read from
 * the view because a handle drag shows a scale the store does not hold yet.
 */
export function textHandleBounds(viewport: Viewport, text: TextElement): TextHandleBounds | null {
  const view = viewport.children
    .find((child) => child.label === 'textContainer')
    ?.children.find((child) => child.label === text.id);
  if (!view) return null;

  const bounds = view.getLocalBounds();
  const scale = text.scale || 1;
  return {
    left: bounds.minX * scale,
    right: bounds.maxX * scale,
    top: bounds.minY * scale,
  };
}
