import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { t } from '../../../i18n';

interface SettingsDialogProps {
  /** The heading; what follows it on its line, such as a release, goes in `subtitle`. */
  title: string;
  subtitle?: string;
  closeLabel: string;
  canSave: boolean;
  onSave: () => void;
  onClose: () => void;
  /** `fullscreen` fills the Obsidian window but for the overlay's margin; unset, a window of its own size. */
  size?: 'fullscreen';
  /** The dialog's body: its tabs and their content (`RulesSettingsTabs`). */
  children: React.ReactNode;
}

/**
 * The window of a settings dialog with vertical tabs (a collection's settings, a campaign's game
 * system): its heading and close button, the body, and Cancel and Save. Escape no control used and
 * a press beside it close it without saving.
 */
export function SettingsDialog({ title, subtitle, closeLabel, canSave, onSave, onClose, size, children }: SettingsDialogProps): React.ReactElement {
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Unless an open list or another control in the dialog took it.
      if (event.key === 'Escape' && !handledByAnotherControl(event)) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-collection-settings-overlay"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="atlas-collection-settings-backdrop" onClick={onClose} />

      <motion.div
        className={cn('atlas-vtt-plugin atlas-collection-settings-modal', size === 'fullscreen' && 'atlas-collection-settings-modal--fullscreen')}
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="atlas-collection-settings-header">
          <h3 id={titleId}>
            {title}
            {subtitle && <span className="atlas-collection-settings-release">{subtitle}</span>}
          </h3>
          <CloseButton onClick={onClose} aria-label={closeLabel} />
        </div>

        {children}

        <div className="atlas-collection-settings-footer">
          <Button variant="outline" className="atlas-csm-cancel" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="default" className="atlas-csm-save" disabled={!canSave} onClick={onSave}>
            {t('common.save')}
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
