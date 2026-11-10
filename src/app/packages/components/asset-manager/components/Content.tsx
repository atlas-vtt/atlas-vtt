import React, { useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { TriangleAlert } from 'lucide-react';
import { tabs, type Tab } from '../types';
import { TooltipProvider } from '../../primitives/tooltip';
import { ContentPane, type ContentPaneProps } from './ContentPane';
import { ContentSkeleton } from './ContentSkeleton';
import { GridAnnouncer } from './GridAnnouncer';
import { PaneMessage } from './PaneMessage';
import { Button } from '../../primitives/button';
import { paneVariants, stillPaneVariants } from './gridMotion';
import { t } from '../../../../i18n';

export interface ContentProps extends ContentPaneProps {
  /** The collection's name as the GM knows it, for the failure message. */
  collectionName: string;
  /** The place's assets could not be loaded: the pane says so and offers to try again. */
  failed: boolean;
  onRetry: () => void;
  /** The open folder; null at the tab's root. */
  selectedFolderId: string | null;
  /** How many folders deep the open folder is; 0 at the tab's root. */
  folderDepth: number;
  /** Search, tag filter and sort of the list; changing it swaps the pane in place. */
  refinement: string;
  /** The assets of this place are not loaded yet: the pane shows no content of its own. */
  loading: boolean;
  /** Whether a pane that is loading shows its skeleton already (`useLoadingReveal`); until then it is empty. */
  showSkeleton: boolean;
}

interface PanePlace {
  key: string;
  collection: string;
  tab: Tab;
  depth: number;
  /** 1 deeper into the folder tree or to a tab further right, -1 back out or left, 0 sideways. */
  direction: number;
}

/**
 * The pane of the open folder and its refinement, and the direction it was
 * reached from. The direction is kept until the next change of pane, so the
 * pane leaving and the pane arriving agree on it for their whole transition.
 * A new refinement of the same folder keeps its depth, so it crossfades.
 */
function usePanePlace(collection: string, tab: Tab, folderId: string | null, depth: number, refinement: string): PanePlace {
  const key = `${collection}/${tab}/${folderId ?? ''}?${refinement}`;
  const [place, setPlace] = useState<PanePlace>({ key, collection, tab, depth, direction: 0 });
  if (place.key === key) return place;
  // Another collection is a sideways jump: its pane crossfades, whatever folder either was in.
  const direction = collection !== place.collection ? 0
    : tab === place.tab ? Math.sign(depth - place.depth)
      : Math.sign(tabs.indexOf(tab) - tabs.indexOf(place.tab));
  const next = { key, collection, tab, depth, direction };
  setPlace(next);
  return next;
}

/**
 * The asset manager's content area. Opening a folder, going back or switching
 * tabs slides the new pane in from the side it lies on; switching collections,
 * searching, filtering by tags or sorting crossfades to a new pane, whose cards
 * appear with it, so no card moves on its own. A place that is
 * loading shows its skeleton in the pane its content will have, so the cards
 * take the place of their placeholders without a transition between them.
 */
export function Content({
  collectionName, failed, onRetry, selectedFolderId, folderDepth, refinement, loading, showSkeleton, ...paneProps
}: ContentProps): React.JSX.Element {
  const place = usePanePlace(paneProps.collection, paneProps.activeTab, selectedFolderId, folderDepth, refinement);
  const still = useReducedMotion() === true;

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={800} skipDelayDuration={0}>
        <GridAnnouncer
          selectionCount={paneProps.selectedAssetIds.length + paneProps.selectedFolderIds.length}
          results={loading || failed ? null : {
            tab: paneProps.activeTab, shown: paneProps.assets.length, narrowed: paneProps.onClearFilters !== undefined,
          }}
        />
        <AnimatePresence initial={false} custom={place.direction}>
          <motion.div
            key={place.key}
            className="atlas-asset-manager-pane"
            custom={place.direction}
            variants={still ? stillPaneVariants : paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {!loading && !failed && <ContentPane {...paneProps} />}
            {!loading && failed && (
              <div className="atlas-asset-manager-content">
                <div className="atlas-empty-state" role="alert">
                  <PaneMessage
                    icon={TriangleAlert}
                    title={t('am.loadFailed.title', { collection: collectionName })}
                    hint={t('am.loadFailed.hint')}
                    action={<Button variant="default" className="atlas-empty-action" onClick={onRetry}>{t('am.loadFailed.retry')}</Button>}
                  />
                </div>
              </div>
            )}
            {loading && showSkeleton && (
              <ContentSkeleton tab={paneProps.activeTab} folderCount={paneProps.folders.length} assetCount={paneProps.assetCount} />
            )}
          </motion.div>
        </AnimatePresence>
      </TooltipProvider>
    </MotionConfig>
  );
}
