import React, { useState, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { App, FileView } from 'obsidian';
import { getActiveWorkspaceLeaf } from '../../utils/embeddedLeafFocus';
import { openContextMenuGlobal, type ContextMenuEntry } from '../root/ContextMenuContext';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { addonViewActionEntries } from '../../addons/addonHost';
import { t } from '../../i18n';
import { showNotice } from '../../ui/notice';

interface ViewActionsMenuProps {
  app: App;
  filePath?: string | undefined;
}

export const ViewActionsMenu: React.FC<ViewActionsMenuProps> = ({ app, filePath }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // mount tracking (no-op)
  }, []);

  const showMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    let activeLeaf = getActiveWorkspaceLeaf(app.workspace);

    if (filePath && activeLeaf) {
      const leaves = app.workspace.getLeavesOfType('atlas-vtt');
      const matchingLeaf = leaves.find(leaf => leaf.view instanceof FileView && leaf.view.file?.path === filePath);
      if (matchingLeaf) activeLeaf = matchingLeaf;
    }

    if (!activeLeaf) return;

    const entries: ContextMenuEntry[] = [
      { type: 'item', label: t('view.splitRight'), icon: 'separator-vertical', onClick: () => app.workspace.createLeafBySplit(activeLeaf, 'vertical') },
      { type: 'item', label: t('view.splitDown'), icon: 'separator-horizontal', onClick: () => app.workspace.createLeafBySplit(activeLeaf, 'horizontal') },
      { type: 'item', label: t('view.newWindow'), icon: 'maximize', onClick: () => app.workspace.moveLeafToPopout(activeLeaf) },
    ];

    if (filePath) {
      entries.push(
        {
          type: 'item', label: t('view.reveal'), icon: 'folder-open',
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) app.showInFolder(file.path);
          },
        },
        {
          type: 'item', label: t('view.copyPath'), icon: 'copy',
          onClick: () => {
            navigator.clipboard.writeText(filePath).then(
              () => showNotice(t('view.pathCopied')),
              (error: unknown) => {
                console.error('[ViewActionsMenu] Copying the file path failed:', error);
                showNotice(t('view.copyFailed'));
              },
            );
          },
        },
        {
          type: 'item', label: t('view.rename'), icon: 'pencil',
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) app.fileManager.promptForFileRename?.(file);
          },
        },
        {
          type: 'item', label: t('common.delete'), icon: 'trash', destructive: true,
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) await app.fileManager.trashFile(file);
          },
        },
      );
    }

    entries.push(
      ...addonViewActionEntries(app),
      { type: 'item', label: t('common.close'), icon: 'x', onClick: () => activeLeaf.detach() },
    );

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    openContextMenuGlobal(entries, { x: rect.right, y: rect.bottom });
  };

  return (
    <div
      className="atlas-view-actions"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <LabelTooltip label={t('view.more')}>
        <button
          className={`atlas-view-actions-btn clickable-icon view-action ${isVisible ? 'visible' : ''}`}
          onClick={showMenu}
        >
          <MoreVertical size={16} />
        </button>
      </LabelTooltip>
    </div>
  );
}
