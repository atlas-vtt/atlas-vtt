import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MotionConfig, motion } from 'framer-motion';
import { handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { Button } from '../../../../packages/components/primitives/button';
import { CloseButton } from '../../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../../packages/components/primitives/dialogMotion';
import type { DiceSets } from '../../../hooks/useDiceSets';
import { t } from '../../../../i18n';
import { DiceLab } from './DiceLab';

interface DiceLabDialogProps {
  /** An element of what opened the lab: the dialog opens in its window, over it. */
  anchor: HTMLElement;
  diceSets: DiceSets;
  /** The set shown first: the one in use where the lab opens. */
  initialId?: string | undefined;
  onClose: () => void;
}

/**
 * The dice lab in a dialog of its own, opened from the collection settings'
 * Dice tab and from a template's Dice rolls…: it needs more room than either
 * has. It opens over whatever opened it, in that window, and closes with
 * Escape where no control inside used the key.
 */
export function DiceLabDialog({ anchor, diceSets, initialId, onClose }: DiceLabDialogProps): React.ReactElement {
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // The lab takes focus as it opens and gives it back to where it was.
  useEffect(() => {
    const before = anchor.doc.activeElement;
    windowRef.current?.focus({ preventScroll: true });
    return () => { if (before?.instanceOf(HTMLElement) && before.isConnected) before.focus({ preventScroll: true }); };
  }, [anchor]);

  // Escape pressed outside the lab (focus left on the page behind) is the lab's too: it is the
  // topmost dialog, and the one under it must not close.
  useEffect(() => {
    const doc = anchor.doc;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as Partial<Node> | null;
      if (event.key !== 'Escape' || handledByAnotherControl(event) || (target && windowRef.current?.contains(target as Node))) return;
      event.preventDefault();
      close.current();
    };
    doc.addEventListener('keydown', onKeyDown, true);
    return () => doc.removeEventListener('keydown', onKeyDown, true);
  }, [anchor]);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Escape' || handledByAnotherControl(event.nativeEvent)) return;
    // Taken, so the dialog this one opened over leaves the key alone.
    event.preventDefault();
    onClose();
  };

  return createPortal(
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-plugin atlas-dice-lab-overlay"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={windowRef}
        tabIndex={-1}
        className="atlas-dice-lab-dialog"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className="atlas-dice-lab-dialog__header">
          <h2 id={titleId}>{t('diceLab.title')}</h2>
          <CloseButton onClick={onClose} />
        </div>
        {/* Dice drop in and fans open with motion; reduced motion keeps only the fades */}
        <MotionConfig reducedMotion="user">
          <DiceLab diceSets={diceSets} initialId={initialId} />
        </MotionConfig>
        <div className="atlas-dice-lab-dialog__footer">
          <Button variant="default" size="sm" onClick={onClose}>{t('common.done')}</Button>
        </div>
      </motion.div>
    </motion.div>,
    anchor.doc.body,
  );
}
