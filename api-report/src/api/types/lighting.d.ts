import type { Disposer, ViewId } from './common';
/** How the player window shows a token: seen, outlined only (sensed), or not at all. */
export type Perception = 'seen' | 'sensed' | 'unseen';
export type PlayerVisibility = 
/** Lighting hides nothing: dynamic lighting off, or the scene unlit. Fog still does (see `tokens`). */
{
    readonly status: 'unlit';
    /**
     * The tokens under the scene's committed fog, which the player window hides: each reads 'unseen', and a token
     * absent here is not under fog. Apply `hidden` yourself. Fog Atlas cannot draw makes the answer `pending`.
     */
    readonly tokens: Readonly<Record<string, 'unseen'>>;
}
/**
 * Sight is not worked out for the scene the store holds (loading, a tab switch, no bounds yet, graphics context lost),
 * the explored memory the window shows is still being decoded, or the window forgot explored areas its saved mask
 * still holds. Fail closed: show players nothing. `watch` fires when it is ready.
 */
 | {
    readonly status: 'pending';
} | {
    readonly status: 'ready';
    /**
     * How the window's lighting perceives each token; a token absent here is 'unseen'. By lighting only: a token the
     * GM hid can read 'seen' here, so apply `hidden` and fog yourself, as you do when the answer is `unlit`.
     */
    readonly tokens: Readonly<Record<string, Perception>>;
    /**
     * Where the player window shows the map, cell by cell (1 = shown), explored memory included. Cells are
     * `cellSize` world pixels square from the map's top-left corner, row by row; `shown` is a fresh copy on every call.
     * Conservative: a cell is shown only when the whole cell is, as sampled every 8 px (16 px on maps over 4096 px,
     * doubling past 8192 px), so coarse cells hide more of the edge, never show more.
     */
    readonly darkness: {
        readonly cellSize: number;
        readonly cols: number;
        readonly rows: number;
        readonly shown: Uint8Array;
    };
    /** The window shows explored memory where no token sees. */
    readonly showsExplored: boolean;
};
export interface PlayerVisibilityOptions {
    /**
     * The map's long side holds at most this many cells (16–1024, default 384); cells double in size from 8 px until it
     * does. A cell is shown only when all of it is, so fewer, larger cells show less near every edge of sight.
     */
    maxCellsPerSide?: number;
}
export interface LightingApi {
    /**
     * What the GM's player window shows of the view's lit scene, and nothing more. Never throws: an unknown view,
     * or anything Atlas cannot tell yet, is `pending`. Never includes walls, lights, polygons or sight.
     */
    playerVisibility(viewId: ViewId, options?: PlayerVisibilityOptions): PlayerVisibility;
    /**
     * Called when what `playerVisibility` returns may have changed outside the store (sight recomputed, lighting switched,
     * a deferred darkness due, explored memory decoded) and when the scene's lighting or explored memory changes. Runs
     * guarded; ends when the view closes. An unknown view gives a disposer that does nothing.
     */
    watch(viewId: ViewId, listener: () => void): Disposer;
}
