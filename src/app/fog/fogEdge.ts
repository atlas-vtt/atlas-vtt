import { isRecord } from '../utils/guards';

/** The widest fog edge the GM can set, in world pixels. */
export const MAX_FOG_EDGE_WIDTH = 300;

/** `soft` fades the fog's edge out, `crackle` breaks it up into a gritty edge. */
export type FogEdgeStyle = 'soft' | 'crackle';

/** How the fog's edge looks: `width` is how far it reaches to either side of the outline, in world pixels; 0 keeps it hard. */
export interface FogEdge {
  style: FogEdgeStyle;
  width: number;
}

/** The edge every GM starts with: crackled, reaching 15 map pixels to either side. */
export const DEFAULT_FOG_EDGE: FogEdge = { style: 'crackle', width: 15 };

/** The edge the fog draws until it is given one: hard. */
export const HARD_FOG_EDGE: FogEdge = { style: 'soft', width: 0 };

/**
 * The blur's standard deviation, in world pixels, for an edge that reaches `width`: a blurred edge
 * is solid fog and open ground again within three of them, so the fade ends where the GM set it.
 */
export function fogEdgeBlur(width: number): number {
  return width / 3;
}

export function sameFogEdge(a: FogEdge, b: FogEdge): boolean {
  return a.style === b.style && a.width === b.width;
}

/** The edge as stored; a style or width Atlas cannot use reads as the default's. */
export function readFogEdge(stored: unknown): FogEdge {
  if (!isRecord(stored)) return DEFAULT_FOG_EDGE;
  const { style, width } = stored;
  return {
    style: style === 'soft' || style === 'crackle' ? style : DEFAULT_FOG_EDGE.style,
    width: typeof width === 'number' && width >= 0 && width <= MAX_FOG_EDGE_WIDTH ? width : DEFAULT_FOG_EDGE.width,
  };
}
