import { isRecord } from '../utils/guards';

/** The widest fog edge the GM can set, in world pixels. */
export const MAX_FOG_EDGE_WIDTH = 100;

/** `soft` fades the fog's edge out, `crackle` breaks it up into a gritty edge. */
export type FogEdgeStyle = 'soft' | 'crackle';

/** How the fog's edge looks: `width` is how far it reaches, in world pixels; 0 keeps it hard. */
export interface FogEdge {
  style: FogEdgeStyle;
  width: number;
}

export const DEFAULT_FOG_EDGE: FogEdge = { style: 'soft', width: 0 };

export function sameFogEdge(a: FogEdge, b: FogEdge): boolean {
  return a.style === b.style && a.width === b.width;
}

/** The edge as stored; what Atlas cannot use reads as the default's: a hard edge, soft where it is given a width. */
export function readFogEdge(stored: unknown): FogEdge {
  if (!isRecord(stored)) return DEFAULT_FOG_EDGE;
  const { style, width } = stored;
  return {
    style: style === 'crackle' ? 'crackle' : DEFAULT_FOG_EDGE.style,
    width: typeof width === 'number' && width >= 0 && width <= MAX_FOG_EDGE_WIDTH ? width : DEFAULT_FOG_EDGE.width,
  };
}
