/**
 * The rules of typing a text on the map that need no field: which point of a text stays where it
 * is while its words change, and what of the typed words is written.
 */

import { withinTextLength } from '../../annotations/annotationList';
import type { TextAlign } from '../../annotations/annotationTypes';
import type { Point } from '../../types/visionTypes';

/** What of a text says where its box lies around its centre. */
interface Stance {
  readonly align: TextAlign;
  /** Degrees. */
  readonly rotation: number;
  readonly scale: number;
}

interface BoxSize {
  readonly width: number;
  readonly height: number;
}

/** From a text's centre to its anchor, in the world: the top of its words' box, at the side its alignment names. */
function toAnchor(box: BoxSize, text: Stance): Point {
  const side = text.align === 'left' ? -1 : text.align === 'right' ? 1 : 0;
  const x = (side * box.width * text.scale) / 2;
  const y = (-box.height * text.scale) / 2;
  const angle = (text.rotation * Math.PI) / 180;
  const cos = text.rotation ? Math.cos(angle) : 1;
  const sin = text.rotation ? Math.sin(angle) : 0;
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * The point of a text that stays where it is while it is typed: on the top side of its words'
 * box, at the left end for a text aligned left, the right end for one aligned right, else the
 * middle. So a line that is added stands under the lines before it, and a line that grows grows
 * away from where it began. `centre` is the text's place, `box` the size of its words' box
 * before its scale.
 */
export function anchorOf(centre: Point, box: BoxSize, text: Stance): Point {
  const offset = toAnchor(box, text);
  return { x: centre.x + offset.x, y: centre.y + offset.y };
}

/** The place of a text whose words' box is `box` and whose anchor is `anchor` (`anchorOf`). */
export function centreFrom(anchor: Point, box: BoxSize, text: Stance): Point {
  const offset = toAnchor(box, text);
  return { x: anchor.x - offset.x, y: anchor.y - offset.y };
}

/** The words a field leaves: what was typed without the spaces and line breaks after its last letter, as long as a text may be at most; none for a field of spaces alone. */
export function typedWords(value: string): string {
  return withinTextLength(value.replace(/\r\n?/g, '\n')).replace(/\s+$/, '');
}
