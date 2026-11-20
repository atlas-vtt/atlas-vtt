import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { useAtlasStore } from '../../ViewStoreContext';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useDraggablePosition, type PanelArea, type PanelPosition } from '../../hooks/useDraggablePosition';
import { usePanelResize } from '../../hooks/usePanelResize';
import { useStableCallback } from '../../hooks/useStableCallback';
import { canRunMapHotkeys } from '../../../keyboard/mapHotkeys';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { ATLAS_DOCS_URL } from '../../../support/communityLinks';
import { DocsFrame } from './DocsFrame';
import { t } from '../../../i18n';

const MARGIN = 12;
/** Narrow enough to stand beside the map, wide enough for the site's one-column pages. */
const MIN_SIZE = { width: 360, height: 320 };

/** Every opening places the panel in the middle of the scene; the hook keeps it inside the map's edges. */
const centred = (area: PanelArea, panel: PanelArea): PanelPosition => ({
  x: (area.width - panel.width) / 2,
  y: (area.height - panel.height) / 2,
});

/** The documentation window of the map view; shown for the GM while it is open. */
export function DocsWindow(): React.ReactElement {
  const open = useAtlasStore((state) => state.isDocsOpen);
  return <AnimatePresence>{open && <DocsPanel key="docs" />}</AnimatePresence>;
}

/**
 * The panel's page leaves as soon as the panel starts to close: it runs in a process of its own, and the closing
 * motion over it dropped most of the frames (as over the Armarium, `ArmariumPane`).
 */
function DocsPanel(): React.ReactElement {
  const { view } = useAtlasUI();
  const present = useIsPresent();
  const setOpen = useAtlasStore((state) => state.setDocsOpen);
  const windowVariants = useDialogWindowVariants();
  const { position, panelRef, startDrag, isDragging } = useDraggablePosition(centred, { margin: MARGIN });
  const [size, setSize] = useState<PanelArea | null>(null);
  // The site lays out and repaints its whole page at every size it is given, so it is sized once, on release.
  const frameRef = useRef<HTMLIFrameElement>(null);
  const startResize = usePanelResize(panelRef, { min: MIN_SIZE, margin: MARGIN, onResizeEnd: setSize, held: frameRef });

  /** Closes the panel; focus in it (on the frame too) goes back to the map, so no key is typed into a closing page. */
  const close = useStableCallback((): void => {
    const panel = panelRef.current;
    const focused = panel?.doc.activeElement;
    if (panel && focused?.instanceOf(HTMLElement) && panel.contains(focused)) focused.blur();
    setOpen(false);
  });

  // Escape closes the panel when it holds focus, or when the press reaches the map and nothing there
  // used it: heard after the map's own keys (both on the document, the map's first), so a wall being
  // drawn or a measurement being dragged takes Escape before the panel does. Keys typed inside the
  // frame stay in its page: a cross-origin frame never passes them on.
  useEffect(() => {
    const doc = panelRef.current?.doc;
    if (!doc) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || handledByAnotherControl(event)) return;
      const panel = panelRef.current;
      const focused = doc.activeElement;
      const inPanel = !!panel && !!focused && panel.contains(focused);
      if (!inPanel && !canRunMapHotkeys(event, view?.viewId)) return;
      event.preventDefault();
      close();
    };
    doc.addEventListener('keydown', onKeyDown);
    return (): void => doc.removeEventListener('keydown', onKeyDown);
  }, [panelRef, view, close]);

  return (
    <motion.section
      ref={panelRef}
      className={`atlas-docs-panel${isDragging ? ' is-dragging' : ''}`}
      style={{ left: position.x, top: position.y, ...size }}
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={t('docs.panel')}
    >
      <header className="atlas-docs-panel__header" onPointerDown={startDrag}>
        <span className="atlas-docs-panel__title">{t('docs.title')}</span>
        <LabelTooltip label={t('docs.openInBrowser')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-docs-panel__action"
            aria-label={t('docs.openInBrowser')}
            onClick={() => { window.open(ATLAS_DOCS_URL); }}
          >
            <ExternalLink />
          </Button>
        </LabelTooltip>
        <CloseButton onClick={close} aria-label={t('docs.close')} />
      </header>

      {present && <DocsFrame frameRef={frameRef} />}

      <div className="atlas-docs-panel__resize atlas-docs-panel__resize--right" onPointerDown={startResize('right')} />
      <div className="atlas-docs-panel__resize atlas-docs-panel__resize--bottom" onPointerDown={startResize('bottom')} />
      <div className="atlas-docs-panel__resize atlas-docs-panel__resize--corner" onPointerDown={startResize('corner')} />
    </motion.section>
  );
}
