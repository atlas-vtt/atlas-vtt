import type { GlyphPen } from '../../glyphPen';
import { hearthBody } from './cooking';

/** Paper surfaces, cross-cut recesses and map-facing shade lines carry the copperplate. */
export function hearth(pen: GlyphPen): void { hearthBody(pen, false); }
/** The same with a fire burning in its firebox. */
export function litHearth(pen: GlyphPen): void { hearthBody(pen, false, true); }
