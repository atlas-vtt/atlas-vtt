import type { GlyphPen } from '../../glyphPen';
import { bustBody } from './parts';

/** Paper fields, cut grain and map-facing shade lines replace material colour. */
export function bust(pen: GlyphPen): void { bustBody(pen, false); }
