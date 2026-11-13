/**
 * What of the Draw tool's choices a device remembers: the style of what is drawn next, so that a
 * reload does not reset it. The mode and what the eraser and the Cells mode do start anew each
 * time: a tool that comes back erasing whole drawings would surprise.
 */

import { PIN_ICON_PATHS } from '../types/pinIconPaths';
import { isRecord } from '../utils/guards';
import { isHexColor } from '../utils/hexColor';
import { DEFAULT_DRAW_TOOL, DRAW_FONTS, DRAW_SIZES, TEXT_ALIGNS, TEXT_LOOKS, type DrawToolChoices } from './annotationTypes';

export type RememberedDrawTool = Omit<DrawToolChoices, 'mode' | 'eraseWhole' | 'cellsUnfill'>;

const oneOf = <T>(options: readonly T[], value: unknown, fallback: T): T => options.find((option) => option === value) ?? fallback;
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/** The part of `choices` that is remembered. */
export function rememberedDrawTool(choices: DrawToolChoices): RememberedDrawTool {
  const { mode: _mode, eraseWhole: _eraseWhole, cellsUnfill: _cellsUnfill, ...style } = choices;
  return style;
}

/** Whether two sets of choices remember the same: a change of mode alone is nothing to store. */
export function sameRememberedDrawTool(a: DrawToolChoices, b: DrawToolChoices): boolean {
  const before: Readonly<Record<string, unknown>> = rememberedDrawTool(a);
  const after: Readonly<Record<string, unknown>> = rememberedDrawTool(b);
  return Object.keys(before).every((field) => before[field] === after[field]);
}

/**
 * The tool's choices as it starts with what a device remembered: every field that can be read,
 * the default for each that cannot (nothing stored, a hand edit, a later Atlas's choice).
 */
export function drawToolFrom(remembered: unknown): DrawToolChoices {
  const base = DEFAULT_DRAW_TOOL;
  if (!isRecord(remembered)) return base;
  const { color, icon } = remembered;
  return {
    ...base,
    color: isHexColor(color) ? color : base.color,
    size: oneOf(DRAW_SIZES, remembered.size, base.size),
    players: flag(remembered.players, base.players),
    layer: oneOf(['above', 'map'] as const, remembered.layer, base.layer),
    seeThrough: flag(remembered.seeThrough, base.seeThrough),
    dash: oneOf(['dashed', 'dotted', null] as const, remembered.dash, base.dash),
    ends: oneOf(['end', 'both', null] as const, remembered.ends, base.ends),
    curved: flag(remembered.curved, base.curved),
    fill: oneOf(['soft', 'solid', null] as const, remembered.fill, base.fill),
    font: oneOf(DRAW_FONTS, remembered.font, base.font),
    look: oneOf(TEXT_LOOKS, remembered.look, base.look),
    align: oneOf(TEXT_ALIGNS, remembered.align, base.align),
    bold: flag(remembered.bold, base.bold),
    italic: flag(remembered.italic, base.italic),
    // A symbol the catalogue does not offer (one of the twelve stamps had before, a later Atlas's) is not what the tool places.
    icon: typeof icon === 'string' && Object.hasOwn(PIN_ICON_PATHS, icon) ? icon : base.icon,
    cellsLayer: oneOf(['above', 'map'] as const, remembered.cellsLayer, base.cellsLayer),
  };
}
