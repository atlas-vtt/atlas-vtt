import React from 'react';
import { motion } from 'framer-motion';
import { Home, Folder, Check } from 'lucide-react';
import type { Tab, Folder as FolderType } from '../types';
import { CloseButton } from '../../primitives/CloseButton';
import { Button } from '../../primitives/button';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../primitives/dialogMotion';
import { t } from '../../../../i18n';

export interface MoveModalProps {
  selectedAssetIds: string[];
  folders: FolderType[];
  activeTab: Tab;
  moveTargetFolderId: string | null;
  setMoveTargetFolderId: (id: string | null) => void;
  moveFolderSearch: string;
  setMoveFolderSearch: (s: string) => void;
  moveFolderListOpen: boolean;
  setMoveFolderListOpen: (open: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function MoveModal({
  selectedAssetIds, folders, activeTab, moveTargetFolderId,
  setMoveTargetFolderId, moveFolderSearch, setMoveFolderSearch,
  moveFolderListOpen, setMoveFolderListOpen, onClose, onConfirm,
}: MoveModalProps): React.JSX.Element {
  const windowVariants = useDialogWindowVariants();
  return (
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-asset-manager-move-modal"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <motion.div className="atlas-asset-manager-move-container" variants={windowVariants} onClick={(e) => e.stopPropagation()}>
        <div className="atlas-asset-manager-move-header">
          <h3>{t('am.move.title')}</h3>
          <CloseButton onClick={(e) => { e.stopPropagation(); onClose(); }} />
        </div>
        <div className="atlas-asset-manager-move-body">
          <p className="atlas-asset-manager-move-info">
            Moving {selectedAssetIds.length} item{selectedAssetIds.length !== 1 ? 's' : ''}
          </p>
          <div className="atlas-asset-manager-move-collections">
            <div className="atlas-asset-manager-move-label">{t('am.move.target')}</div>
            <input
              type="text"
              className="atlas-asset-manager-move-input"
              placeholder={t('am.move.search')}
              value={moveFolderSearch}
              onChange={(e) => setMoveFolderSearch(e.target.value)}
              onFocus={() => setMoveFolderListOpen(true)}
              onBlur={() => window.setTimeout(() => setMoveFolderListOpen(false), 150)}
            />
            {moveFolderListOpen && (
              <div className="atlas-move-folder-list">
                {(!moveFolderSearch || 'root folder'.includes(moveFolderSearch.toLowerCase())) && (
                  <div
                    className={`atlas-move-folder-item ${moveTargetFolderId === null ? 'is-selected' : ''}`}
                    onClick={() => setMoveTargetFolderId(null)}
                  >
                    <Home size={14} />
                    <span>{t('am.move.root')}</span>
                    {moveTargetFolderId === null && <Check size={14} className="atlas-move-folder-check" />}
                  </div>
                )}
                {folders
                  .filter(f => {
                    if (f.type !== activeTab) return false;
                    if (!moveFolderSearch) return true;
                    const search = moveFolderSearch.toLowerCase();
                    return f.name.toLowerCase().includes(search) || f.path.toLowerCase().includes(search);
                  })
                  .map(folder => (
                    <div
                      key={folder.id}
                      className={`atlas-move-folder-item ${moveTargetFolderId === folder.id ? 'is-selected' : ''}`}
                      onClick={() => setMoveTargetFolderId(folder.id)}
                    >
                      <Folder size={14} />
                      <span>{folder.path}</span>
                      {moveTargetFolderId === folder.id && <Check size={14} className="atlas-move-folder-check" />}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div className="atlas-asset-manager-move-footer">
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>{t('common.cancel')}</Button>
          <Button variant="default" size="sm" onClick={(e) => { e.stopPropagation(); onConfirm(); }}>{t('am.move.move')}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
