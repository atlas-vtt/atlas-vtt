import type { Point, ViewId } from './common';
export interface TokenMove {
    tokenId: string;
    x: number;
    y: number;
}
export interface TokenMoveOptions {
    /** Snap each token the way `snapPoint` does. Default true. */
    snap?: boolean;
    /**
     * Keep each token's final position on the map, `[0, width] x [0, height]`: when its snapped position is off the map,
     * the nearest snapped position inside it is used. Default true; a map without a size is not clamped. The GM's own
     * drag does not clamp, this is the API's extra.
     */
    clampToMap?: boolean;
    /** Move hidden tokens too. Default false: a hidden token is refused. */
    allowHidden?: boolean;
}
export type TokenMoveResult = {
    ok: true;
    positions: Readonly<Record<string, Readonly<Point>>>;
} | {
    ok: false;
    reason: 'not-loaded' | 'unknown-token' | 'hidden' | 'invalid-position';
};
export interface TokensApi {
    /**
     * Where a token of `tokenSize` cells dropped at `point` lands, as the GM's drag puts it: a cell centre, or where
     * cells meet for an even footprint, also on a grid that is hidden or switched off; unchanged without a grid, with
     * snapping off, or for an unknown view. Returns a frozen point. Throws when `point` is not finite { x, y } numbers
     * or `tokenSize` is not a number above 0.
     */
    snapPoint(viewId: ViewId, point: Point, tokenSize: number): Readonly<Point>;
    /**
     * Moves tokens as one undo step, like a GM drop: the moved tokens rise to the top of the stack and are no longer held. Checked in this order, and nothing is written when any move
     * fails: the map is loaded and the view is not a remote view, which is read-only (`not-loaded`), every token exists (`unknown-token`), none is hidden unless
     * `allowHidden` (`hidden`), every position is a number within 1e9 of the origin (`invalid-position`, also when snapping would
     * not give one). A token named twice moves to its last position. Throws when `moves` is not a list or `options` is malformed.
     */
    move(viewId: ViewId, moves: readonly TokenMove[], options?: TokenMoveOptions): TokenMoveResult;
}
