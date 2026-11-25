import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import type { DiceFont } from '../../dice3d/diceLook';
import { cachedDicePreviews, dicePreviewsVersion, fillDicePreviews, subscribeDicePreviews, type DicePreviews } from '../../dice3d/dicePreviews';
import { runInBackground } from '../../utils/backgroundTask';
import { useDiceLook } from './useDiceLook';

/**
 * A d20 in each colour and `font`, as image URLs, and the ring of the chosen one,
 * rendered by the dice renderer itself: those already rendered at once, the rest
 * as they come. Checked again when Obsidian's CSS changes, since the accent die
 * takes the accent colour.
 */
export function useDicePreviews(app: App | undefined, font: DiceFont): DicePreviews {
  const [cssVersion, setCssVersion] = useState(0);
  const version = useSyncExternalStore(subscribeDicePreviews, dicePreviewsVersion);

  useEffect(() => {
    if (!app) return;
    const ref = app.workspace.on('css-change', () => setCssVersion((next) => next + 1));
    return (): void => app.workspace.offref(ref);
  }, [app]);

  useEffect(() => {
    runInBackground(fillDicePreviews(font, true), 'Rendering the dice colours');
  }, [font, cssVersion]);

  // `version` and `cssVersion` say when the kept previews or the accent colour changed.
  return useMemo(() => cachedDicePreviews(font), [font, cssVersion, version]);
}

/** Renders the dice colours ahead while `active`, so the panels that show them open with them. */
export function useDicePreviewWarmUp(app: App | undefined, active: boolean): void {
  const { font } = useDiceLook(app);
  useEffect(() => {
    if (active) runInBackground(fillDicePreviews(font, false), 'Rendering the dice colours ahead');
  }, [active, font]);
}
