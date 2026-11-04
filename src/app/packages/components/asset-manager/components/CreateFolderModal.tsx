import React from 'react';
import { motion } from 'framer-motion';
import { FolderPlus } from 'lucide-react';
import type { Tab } from '../types';
import { getTabDisplayName } from '../types';
import { CloseButton } from '../../primitives/CloseButton';
import { Button } from '../../primitives/button';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../primitives/dialogMotion';
import { t } from '../../../../i18n';

export interface CreateFolderModalProps {
  selectedFolderId: string | null;
  activeTab: Tab;
  targetFolderName: string;
  setTargetFolderName: (name: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function CreateFolderModal({
  selectedFolderId, activeTab, targetFolderName,
  setTargetFolderName, onClose, onConfirm,
}: CreateFolderModalProps): React.JSX.Element {
  const windowVariants = useDialogWindowVariants();
  return (
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-asset-manager-move-modal atlas-asset-manager-create-folder-modal"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <motion.div className="atlas-asset-manager-move-container" variants={windowVariants} onClick={(e) => e.stopPropagation()}>
        <div className="atlas-asset-manager-move-header">
          <h3><FolderPlus /> {t('am.folder.newTitle')}</h3>
          <CloseButton onClick={(e) => { e.stopPropagation(); onClose(); }} />
        </div>
        <div className="atlas-asset-manager-move-body">
          <p className="atlas-asset-manager-move-info">
            {t(selectedFolderId ? 'am.folder.createsInside' : 'am.folder.createsTop', { tab: getTabDisplayName(activeTab).toLocaleLowerCase() })}
          </p>
          <div className="atlas-asset-manager-move-collections">
            <div className="atlas-asset-manager-move-label">{t('am.folder.name')}</div>
            <input
              type="text"
              placeholder={t('am.folder.namePlaceholder')}
              value={targetFolderName}
              onChange={(e) => setTargetFolderName(e.target.value)}
              className="atlas-asset-manager-move-input"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && targetFolderName.trim()) onConfirm(); }}
            />
          </div>
        </div>
        <div className="atlas-asset-manager-move-footer">
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>{t('common.cancel')}</Button>
          <Button
            variant="default"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onConfirm(); }}
            disabled={!targetFolderName.trim()}
          >
            {t('am.folder.create')}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
