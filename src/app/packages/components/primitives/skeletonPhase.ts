import type * as React from 'react';

/** `$skeleton-breath` out and back (`styles/_skeleton.scss`). */
const BREATH_CYCLE_MS = 3200;

/**
 * Starts the breath of a placeholder in step with every other one. They mount
 * at different moments; a negative delay puts each animation on one clock
 * shared by the whole window, so a screen of waiting cards breathes as one.
 */
export function skeletonPhaseStyle(): React.CSSProperties {
  return { '--atlas-skeleton-phase': skeletonPhase() } as React.CSSProperties;
}

/** The value of `--atlas-skeleton-phase` for a placeholder mounting now; `skeletonPhaseStyle` for elements built with the DOM. */
export function skeletonPhase(): string {
  return `${-Math.round(performance.now() % BREATH_CYCLE_MS)}ms`;
}
