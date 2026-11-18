import React, { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { App, FileView } from 'obsidian';
import { getActiveWorkspaceLeaf } from '../../utils/embeddedLeafFocus';
import { openContextMenuGlobal, type ContextMenuEntry } from '../root/ContextMenuContext';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';
import { showNotice } from '../../ui/notice';
import { desktopOnly } from '../../platform/desktopOnly';
import { deviceProfile } from '../../platform/deviceProfile';

interface ViewActionsMenuProps {
  app: App;
  filePath?: string | undefined;
}

/**
 * The view's own actions (split, rename, close): what Obsidian's view header holds, which Atlas
 * hides on desktop. On mobile that header stays and its menu offers them, so this button is left out.
 */
export const ViewActionsMenu: React.FC<ViewActionsMenuProps> = ({ app, filePath }) => {
  const [isVisible, setIsVisible] = useState(false);
  if (deviceProfile().isMobileApp) return null;

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
    ];

    if (filePath) {
      entries.push(
        // The system's file manager: desktop only
        ...desktopOnly<ContextMenuEntry>({
          type: 'item', label: t('view.reveal'), icon: 'folder-open',
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) app.showInFolder(file.path);
          },
        }),
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
          className={`atlas-view-actions-btn ${isVisible ? 'visible' : ''}`}
          onClick={showMenu}
        >
          <MoreVertical size={16} />
        </button>
      </LabelTooltip>
    </div>
  );
}
