/**
 * One clock for everything on a map that moves by itself (flickering lights, liquids, the levels
 * below): its frames fall on one grid of `ANIMATION_FPS` slots a second, and an animation that
 * runs slower takes every so many of them. Every frame is a render of the whole stage, the
 * lighting's composite included, so animations whose frames fall in the same display frame share
 * one render instead of each asking for its own (a liquid at 30 frames a second and a torch at 30
 * out of step with it made 60 renders a second).
 */
export const ANIMATION_FPS = 30;

/** Milliseconds of one slot of the grid. */
export const ANIMATION_SLOT_MS = 1000 / ANIMATION_FPS;

/** How many slots of the grid an animation shown every `ms` milliseconds takes: at least one. */
export function slotsOf(ms: number): number {
  return Math.max(1, Math.round(ms / ANIMATION_SLOT_MS));
}

/** Whether an animation drawn every `every` slots, last at `last` (ms, null before the first), is due at `now`. */
export function animationFrameDue(now: number, last: number | null, every = 1): boolean {
  if (last === null) return true;
  const span = ANIMATION_SLOT_MS * every;
  return Math.floor(now / span) !== Math.floor(last / span);
}

/**
 * The time of the display frame a ticker is running its callbacks for (ms): the same for every
 * callback of that frame. The clock's own time for a ticker that tells none.
 */
export function frameTime(ticker: { lastTime?: number; elapsedMS?: number }): number {
  const time = (ticker.lastTime ?? NaN) + (ticker.elapsedMS ?? NaN);
  return Number.isFinite(time) ? time : performance.now();
}
