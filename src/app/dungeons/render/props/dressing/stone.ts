import type { GlyphPen } from '../../glyphPen';
import { bustBody } from './parts';

/** Material colours and top-left modelling belong to the Stone hand. */
export function bust(pen: GlyphPen): void { bustBody(pen, true); }
