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
 * Limited walls (hedges, low walls: sight and light pass the first and stop at the second).
 * Off: the rule that counts them is not yet safe (see CLAUDE.md, "Limited walls"). While it is
 * off no wall reads as limited (`readWall`), so none of the code that counts them runs, and
 * the wall menu does not offer the switch. Do not switch it on before the open points are closed.
 */
export const LIMITED_WALLS = false;

/** TV viewport tool: DM-placed viewport rectangle the player window camera can follow. */
export const TV_VIEWPORT_ENABLED = true;
