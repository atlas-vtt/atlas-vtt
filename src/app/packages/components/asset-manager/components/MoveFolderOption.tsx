import React, { useRef } from 'react';
import { Folder } from 'lucide-react';
import type { Folder as FolderType } from '../types';
import { LabelTooltip } from '../../primitives/tooltip';
import { PickerOption, type PickerRow } from './PickerOption';

/** Deeper folders keep this indent, so a long chain never pushes names out of the row. */
const MAX_INDENT = 6;

interface MoveFolderOptionProps {
  folder: FolderType;
  /** While a search narrows the list the tree is gone, so the row names the folders it lies in instead of indenting. */
  searching: boolean;
  /** The folder the items lie in now: marked, and Move waits for another. */
  current: boolean;
  row: PickerRow;
  onSelect: () => void;
}

/**
 * One folder of the Move dialog's list: its own name, indented under its parent (each folder comes before its
 * subfolders), so nested folders with long names stay apart. The full path shows in a tooltip.
 */
export function MoveFolderOption({ folder, searching, current, row, onSelect }: MoveFolderOptionProps): React.JSX.Element {
  const nameRef = useRef<HTMLSpanElement>(null);
  const parents = folder.path.split('/').slice(0, -1);
  const depth = searching ? 0 : Math.min(parents.length, MAX_INDENT);
  const isCut = (): boolean => { const el = nameRef.current; return el !== null && el.scrollWidth > el.clientWidth; };
  return (
    <PickerOption
      row={row}
      icon={<Folder size={14} />}
      name={folder.name}
      nameRef={nameRef}
      detail={searching && parents.length > 0 && <span className="atlas-move-folder-parent">{parents.join(' / ')}</span>}
      current={current}
      onSelect={onSelect}
      style={{ '--atlas-move-folder-depth': depth } as React.CSSProperties}
      wrap={(element) => <LabelTooltip label={folder.path} describe opensWhen={() => parents.length > 0 || isCut()}>{element}</LabelTooltip>}
    />
  );
}
