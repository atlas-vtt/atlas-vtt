/**
 * The text the Draw tool's Text mode leaves: the words the GM gave, in the look the tool is set to.
 */

import type { Point } from '../types/visionTypes';
import type { DrawFont, DrawToolChoices, TextInput } from './annotationTypes';
import { textHeight } from './drawSizes';

/** The family a text is written in for each face the tool offers: the names the stylesheet's `@font-face` rules declare. */
export const FONT_FAMILIES: Readonly<Record<DrawFont, string>> = {
  medieval: 'Atlas Fantaisie Artistique',
  scifi: 'Atlas Oxanium',
  mono: 'Atlas Courier Prime',
};

/** The plate of the tool's Plate look: the dark chip every text had before there were looks. */
export const TEXT_PLATE = { backgroundColor: '#000000', padding: 8, borderRadius: 4, opacity: 0.7 } as const;

/**
 * The text `text` centred on `at`, with the tool's choices, on a map whose cells are `cell` wide:
 * its colour, its height from the size, its face, its look (a plate, the outline, or neither),
 * its alignment and weight, who sees it and where it lies. It is as wide as its words; whoever
 * gives it a width adds `width` and `breaks`.
 */
export function madeText(text: string, at: Point, tool: DrawToolChoices, cell: number): TextInput {
  return {
    x: at.x,
    y: at.y,
    text,
    fontSize: textHeight(tool.size, cell),
    fontFamily: FONT_FAMILIES[tool.font],
    color: tool.color,
    ...(tool.look === 'plate' && TEXT_PLATE),
    ...(tool.look === 'outline' && { outline: true as const }),
    align: tool.align,
    bold: tool.bold,
    italic: tool.italic,
    rotation: 0,
    scale: 1,
    ...(!tool.players && { hidden: true as const }),
    ...(tool.layer === 'map' && { layer: 'map' as const }),
  };
}
