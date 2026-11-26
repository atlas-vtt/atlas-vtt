import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import type { DiceFont } from '../../dice3d/diceLook';
import {
  cachedDicePreviews, dicePreviewsVersion, fillDicePreviews, subscribeDicePreviews, type DicePreviews, type PreviewRequest,
} from '../../dice3d/dicePreviews';
import { runInBackground } from '../../utils/backgroundTask';
import { useDiceLook } from './useDiceLook';

/**
 * The d20s of `font` in every colour and the ring of the chosen one, rendered
 * by the dice renderer itself; null until a whole set is there. While the set
 * of a new font or accent colour renders, the last whole set stays, so the
 * strip changes in one step. Checked again when Obsidian's CSS changes, since
 * the accent die takes the accent colour.
 */
export function useDicePreviews(app: App | undefined, font: DiceFont): DicePreviews | null {
  const [cssVersion, setCssVersion] = useState(0);
  const version = useSyncExternalStore(subscribeDicePreviews, dicePreviewsVersion);

  useEffect(() => {
    if (!app) return;
    const ref = app.workspace.on('css-change', () => setCssVersion((next) => next + 1));
    return (): void => app.workspace.offref(ref);
  }, [app]);

  useEffect(() => {
    runInBackground(fillDicePreviews(font, 'shown'), 'Rendering the dice colours');
  }, [font, cssVersion]);

  // `version` and `cssVersion` say when the kept previews or the accent colour changed.
  const fresh = useMemo(() => cachedDicePreviews(font), [font, cssVersion, version]);
  const [last, setLast] = useState(fresh);
  if (fresh !== null && fresh !== last) setLast(fresh);
  return fresh ?? last;
}

/**
 * Renders the dice colours of both fonts ahead while `active`, so the panels
 * that show them open with them. `request` says whether a stage may be built for
 * them (`soon`) or only a waiting one used (`ifStage`).
 */
export function useDicePreviewWarmUp(app: App | undefined, active: boolean, request: Exclude<PreviewRequest, 'shown'> = 'ifStage'): void {
  const { font } = useDiceLook(app);
  useEffect(() => {
    if (active) runInBackground(fillDicePreviews(font, request), 'Rendering the dice colours ahead');
  }, [active, font, request]);
}
