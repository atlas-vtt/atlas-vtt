import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { useFocusTrap } from '../../../packages/components/primitives/useFocusTrap';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { t } from '../../../i18n';
import { portalHost } from '../../../host/portalHost';

interface SettingsDialogProps {
  /** The heading; what follows it on its line, such as a release, goes in `subtitle`. */
  title: string;
  subtitle?: string;
  closeLabel: string;
  canSave: boolean;
  /** The draft differs from the one the dialog opened with (`useUnsavedChanges`). */
  hasChanges: boolean;
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
 * a press beside it close an unchanged dialog; a changed one stays, so that only Cancel and the
 * close button, which say so, drop what was not saved.
 */
export function SettingsDialog({ title, subtitle, closeLabel, canSave, hasChanges, onSave, onClose, size, children }: SettingsDialogProps): React.ReactElement {
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  useFocusTrap(windowRef);

  useEffect(() => {
    if (hasChanges) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Unless an open list or another control in the dialog took it.
      if (event.key === 'Escape' && !handledByAnotherControl(event)) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, onClose]);

  return createPortal(
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-collection-settings-overlay"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="atlas-collection-settings-backdrop" onClick={hasChanges ? undefined : onClose} />

      <motion.div
        className={cn('atlas-vtt-plugin atlas-collection-settings-modal', size === 'fullscreen' && 'atlas-collection-settings-modal--fullscreen')}
        ref={windowRef}
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
    portalHost(),
  );
}
