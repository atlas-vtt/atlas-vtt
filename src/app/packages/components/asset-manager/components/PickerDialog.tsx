import React, { type RefObject } from 'react';
import { motion } from 'framer-motion';
import { CloseButton } from '../../primitives/CloseButton';
import { Button } from '../../primitives/button';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../primitives/dialogMotion';
import { t } from '../../../../i18n';

export interface PickerDialogProps {
  /** The dialog's window: what its Escape, focus trap and focus return hold on to. */
  windowRef: RefObject<HTMLDivElement | null>;
  title: React.ReactNode;
  /** A class of the overlay beside the shared one, naming the dialog. */
  className?: string;
  confirmLabel: string;
  canConfirm: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The frame of the asset manager's small dialogs (Move to folder, Move or Copy to collection, New folder): the overlay
 * over the window, the title with its close button, the body, and Cancel beside the dialog's one action. A press on
 * the overlay closes it, and no press reaches the asset manager behind it. Mount it in an `AnimatePresence`.
 */
export function PickerDialog({ windowRef, title, className, confirmLabel, canConfirm, onConfirm, onClose, children }: PickerDialogProps): React.JSX.Element {
  const windowVariants = useDialogWindowVariants();
  return (
    <motion.div
      {...dialogOverlayMotion}
      className={className ? `atlas-asset-manager-move-modal ${className}` : 'atlas-asset-manager-move-modal'}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <motion.div ref={windowRef} className="atlas-asset-manager-move-container" variants={windowVariants} onClick={(e) => e.stopPropagation()}>
        <div className="atlas-asset-manager-move-header">
          <h3>{title}</h3>
          <CloseButton onClick={(e) => { e.stopPropagation(); onClose(); }} />
        </div>
        <div className="atlas-asset-manager-move-body">{children}</div>
        <div className="atlas-asset-manager-move-footer">
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>{t('common.cancel')}</Button>
          <Button variant="default" size="sm" disabled={!canConfirm} onClick={(e) => { e.stopPropagation(); onConfirm(); }}>{confirmLabel}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
