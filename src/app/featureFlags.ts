/**
 * Build-level feature switches.
 *
 * Atlas VTT ships offline-only for its first release. The features below are
 * implemented but not shipped: their code is left in place and gated here, so
 * re-enabling one is a single edit rather than a revert.
 *
 * These are deliberately constants rather than persisted settings — a shipped
 * build must not expose a switch that turns on a feature the release does not support.
 * A feature that ships for the GM to try is not one of these: it is an experimental feature,
 * switched on in the command palette (`experimental/experimentalFeatures.ts`).
 */

/** Ambient sound tool in the map toolbar. */
export const AMBIENT_AUDIO_ENABLED = false;

/**
 * Limited walls (hedges, low walls: sight and light pass the first and stop at the second). Off:
 * `readWall` reads no wall as limited, so one whose file says so blocks like any wall, none of the
 * code that counts them runs and the wall menu offers no switch. It stays off while the count is
 * unsafe: walls within `LIMITED_JOIN` are one hedge, which shows what two drawn hedges must hide
 * (beside an X, hedges side by side); light passes two hedges in a solid wall's soft shadow; two
 * met at the same distance are told apart by rounding; a viewer or light on a hedge sees hairlines.
 */
export const LIMITED_WALLS = false;
