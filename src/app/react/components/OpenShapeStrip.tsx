import React, { useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { OPEN_SHAPE_CONTROL, openShapeOf } from '../../pixi/utils/openShape';
import { Button } from '../../packages/components/primitives/button';
import { useCoarsePointer } from '../../platform/useCoarsePointer';
import { MOTION_FAST_MS, PANEL_ENTER_MS, easeOut } from '../../utils/motion';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useViewStoreHook } from '../ViewStoreContext';
import { usePlacementHandSize } from './PlacementHint';
import { t } from '../../i18n';
import './placement-hint.scss';

/**
 * What Enter and Backspace are to a keyboard, for a finger: while a shape placed point by point
 * waits for its next point (a line of the Draw tool, a ruler, a fog polygon, a wall chain), a
 * strip above the toolbar ends it where it is and takes its last point back. It has the look of
 * the strip that places tokens, and like it shows under a coarse pointer alone: a keyboard has
 * the keys. Its buttons keep their places, disabled where there is nothing to do. While tokens
 * are in hand their strip stands there: every press is the placement's then.
 */
export function OpenShapeStrip(): React.ReactElement {
  const shape = openShapeOf(useViewStoreHook());
  const state = useSyncExternalStore(shape.subscribe, () => shape.state);
  const coarse = useCoarsePointer();
  const placing = usePlacementHandSize(useAtlasUI().renderer?.placementHand ?? null) > 0;
  const reduced = useReducedMotion();
  const rise = reduced ? 0 : 8;
  const marker = { [OPEN_SHAPE_CONTROL]: '' };
  return (
    <div className="atlas-bottom-toolbar-row__above">
      <AnimatePresence>
        {coarse && state && !placing && (
          <motion.div
            key="open-shape-strip"
            role="toolbar"
            aria-label={t('toolbar.openShape')}
            className="atlas-vtt-toolbar atlas-placement-strip"
            {...marker}
            initial={{ opacity: 0, y: rise }}
            animate={{ opacity: 1, y: 0, transition: { duration: PANEL_ENTER_MS / 1000, ease: easeOut } }}
            exit={{ opacity: 0, transition: { duration: MOTION_FAST_MS / 1000, ease: easeOut } }}
          >
            <Button variant="toolbar" className="atlas-placement-strip__text" disabled={!state.canGoBack} onClick={() => shape.back()}>{t('toolbar.undoPoint')}</Button>
            <Button variant="toolbar" className="atlas-placement-strip__done" disabled={!state.canFinish} onClick={() => shape.finish()}>{t('common.done')}</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
