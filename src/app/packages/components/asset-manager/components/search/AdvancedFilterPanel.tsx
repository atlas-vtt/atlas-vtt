import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_CONTROL_POINTS } from '../../../../../utils/motion';
import { Button } from '../../../primitives/button';
import { CloseButton } from '../../../primitives/CloseButton';
import { useDialogEscape } from '../../../primitives/useDialogEscape';
import type { CreatureFilterPanel } from '../../hooks/useCreatureFilters';
import { CreatureFilterControls, hiddenFilterText } from './CreatureFilterControls';
import { t } from '../../../../../i18n';

const PANEL_MOTION = {
  initial: { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
  animate: { opacity: 1, transform: 'translateY(0px) scale(1)' },
  exit: { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
  transition: { duration: 0.16, ease: EASE_OUT_CONTROL_POINTS },
};

interface AdvancedFilterPanelProps {
  panel: CreatureFilterPanel;
  onClose: () => void;
  onReset: () => void;
  /** The button that opens the panel; a click on it is not a click outside. */
  anchorRef: React.RefObject<HTMLElement | null>;
}

/**
 * The filters of the Characters tab under the search: the statblock fields the
 * characters in view have, as ranges and option chips. The search's typed
 * filters and the chips under the header edit the same selection.
 */
export function AdvancedFilterPanel({ panel, onClose, onReset, anchorRef }: AdvancedFilterPanelProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const hidden = hiddenFilterText(panel.result.hidden);

  useDialogEscape(rootRef, onClose);

  useEffect(() => {
    const doc = rootRef.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    doc.addEventListener('pointerdown', onPointerDown);
    return () => doc.removeEventListener('pointerdown', onPointerDown);
  }, [onClose, anchorRef]);

  return (
    <motion.div ref={rootRef} className="atlas-filter-panel" role="dialog" aria-label={t('filters.title')} {...PANEL_MOTION}>
      <div className="atlas-filter-panel__header">
        <h3>{t('filters.title')}</h3>
        <CloseButton onClick={onClose} aria-label={t('filters.close')} />
      </div>

      <div className="atlas-filter-panel__body">
        <CreatureFilterControls panel={panel} />
      </div>

      <div className="atlas-filter-panel__footer">
        {hidden && <span className="atlas-filter-panel__hidden" role="status">{hidden}</span>}
        <Button variant="ghost" className="atlas-filter-panel__reset" disabled={panel.activeCount === 0} onClick={onReset}>{t('common.reset')}</Button>
        <Button variant="default" className="atlas-filter-panel__done" onClick={onClose}>{t('common.done')}</Button>
      </div>
    </motion.div>
  );
}
