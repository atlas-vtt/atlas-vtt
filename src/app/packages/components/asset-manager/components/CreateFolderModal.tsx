import React, { useId, useRef } from 'react';
import { FolderPlus } from 'lucide-react';
import type { Tab } from '../types';
import { getTabDisplayName } from '../types';
import { useDialogEscape } from '../../primitives/useDialogEscape';
import { useFocusTrap } from '../../primitives/useFocusTrap';
import { folderNameProblem } from '../utils/folderName';
import { useFocusReturn } from '../hooks/useFocusReturn';
import { PickerDialog } from './PickerDialog';
import { t } from '../../../../i18n';

export interface CreateFolderModalProps {
  selectedFolderId: string | null;
  activeTab: Tab;
  targetFolderName: string;
  setTargetFolderName: (name: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  /** Whether a file or folder of this (trimmed) name already lies where the new folder would go. */
  isNameTaken: (name: string) => boolean;
}

export function CreateFolderModal({
  selectedFolderId, activeTab, targetFolderName,
  setTargetFolderName, onClose, onConfirm, isNameTaken,
}: CreateFolderModalProps): React.JSX.Element {
  const windowRef = useRef<HTMLDivElement>(null);
  // Escape and Tab are this dialog's; neither reaches the asset manager behind it.
  useDialogEscape(windowRef, onClose);
  useFocusTrap(windowRef);
  useFocusReturn(windowRef);
  const nameId = useId();
  const errorId = useId();
  // Checked as the name is typed, so the dialog keeps the name and says what is wrong beside it.
  const nameError = folderNameProblem(targetFolderName, isNameTaken);
  const canCreate = targetFolderName.trim() !== '' && nameError === null;
  return (
    <PickerDialog
      windowRef={windowRef}
      className="atlas-asset-manager-create-folder-modal"
      // The title says where the folder goes, so the dialog needs no line of its own for it.
      title={<><FolderPlus /> {selectedFolderId ? t('am.folder.newSubfolder') : t('am.folder.newIn', { tab: getTabDisplayName(activeTab) })}</>}
      confirmLabel={t('am.folder.create')}
      canConfirm={canCreate}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="atlas-asset-manager-move-collections">
        <label htmlFor={nameId} className="atlas-asset-manager-move-label">{t('am.folder.name')}</label>
        <input
          id={nameId}
          type="text"
          placeholder={t('am.folder.namePlaceholder')}
          value={targetFolderName}
          onChange={(e) => setTargetFolderName(e.target.value)}
          className="atlas-asset-manager-move-input"
          aria-invalid={nameError !== null || undefined}
          {...(nameError ? { 'aria-describedby': errorId } : {})}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) onConfirm(); }}
        />
        {nameError && <p id={errorId} className="atlas-csm-hint atlas-csm-hint--error" role="alert">{nameError}</p>}
      </div>
    </PickerDialog>
  );
}
