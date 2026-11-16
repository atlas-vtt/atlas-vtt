import React from 'react';
import { Folder } from 'lucide-react';
import type { Folder as FolderType, SelectionEvent } from '../types';
import { anchorAtElement, anchorAtPointer, type MenuAnchor } from '../utils/menuAnchor';

export interface FolderGridItemProps {
  folder: FolderType;
  isSelected: boolean;
  isDropTarget: boolean;
  /** Whether a drag is in progress that could be dropped onto this folder. */
  canReceiveDrop: boolean;
  onSelection: (folderId: string, event?: SelectionEvent) => void;
  onOpen: (folderId: string) => void;
  onContextMenu: (folder: FolderType, anchor: MenuAnchor) => void;
  onDragStart: (folderId: string, event: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOverTarget: (folderId: string | null) => void;
  onDrop: (folderId: string) => void;
}

/**
 * One folder of the content area, an option of the folders' listbox (`FolderGrid`); a drop
 * target for assets and other folders. Enter or Space opens it, Shift with them selects it,
 * Shift+F10 opens its menu.
 */
export function FolderGridItem({
  folder, isSelected, isDropTarget, canReceiveDrop,
  onSelection, onOpen, onContextMenu, onDragStart, onDragEnd, onDragOverTarget, onDrop,
}: FolderGridItemProps): React.JSX.Element {
  const keyHandler = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'F10' && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      onContextMenu(folder, anchorAtElement(event.currentTarget));
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.shiftKey) onSelection(folder.id, event);
    else onOpen(folder.id);
  };

  return (
    <div
      className={`atlas-folder-grid-item ${isSelected ? 'atlas-selected' : ''} ${isDropTarget ? 'atlas-drop-target' : ''}`}
      onClick={(event) => onSelection(folder.id, event)}
      onDoubleClick={() => onOpen(folder.id)}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextMenu(folder, anchorAtPointer(event)); }}
      data-folder-id={folder.id}
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      onKeyDown={keyHandler}
      draggable
      onDragStart={(event) => onDragStart(folder.id, event)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (canReceiveDrop) onDragOverTarget(folder.id);
      }}
      onDragLeave={() => onDragOverTarget(null)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (canReceiveDrop) onDrop(folder.id);
        onDragOverTarget(null);
      }}
    >
      <Folder className="atlas-folder-icon" />
      <span className="atlas-folder-name">{folder.name}</span>
    </div>
  );
}
