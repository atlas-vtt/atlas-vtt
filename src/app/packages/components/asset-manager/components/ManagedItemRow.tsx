import React, { useEffect, useRef } from 'react';
import { Tag, FolderOpen, MoreVertical, Check, X } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

/** A tag or collection in the manager: acted on by id, shown by name. */
export interface ManagedItem {
  id: string;
  name: string;
}

interface ManagedItemRowProps {
  item: ManagedItem;
  kind: 'tag' | 'collection';
  isSelected: boolean;
  /** The pending name while the row is being renamed, otherwise null. */
  editValue: string | null;
  onEditValueChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  /** `range` is true for Shift+click on the row. */
  onSelect: (range: boolean) => void;
  onOpenMenu: (event: React.MouseEvent) => void;
}

export function ManagedItemRow({
  item, kind, isSelected, editValue, onEditValueChange, onSaveEdit, onCancelEdit, onSelect, onOpenMenu,
}: ManagedItemRowProps): React.JSX.Element {
  const editInputRef = useRef<HTMLInputElement>(null);
  const isEditing = editValue !== null;

  useEffect(() => {
    if (!isEditing) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [isEditing]);

  return (
    <div
      className={`atlas-item-row ${isSelected ? 'atlas-selected' : ''}`}
      onClick={(e) => { if (!isEditing) onSelect(e.shiftKey); }}
      onContextMenu={onOpenMenu}
    >
      <div className="atlas-selection-checkbox">
        <LabelTooltip label={t('am.card.select', { name: item.name })}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(false);
            }}
          />
        </LabelTooltip>
      </div>

      {isEditing ? (
        <div className="atlas-edit-mode">
          <input
            ref={editInputRef}
            type="text"
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              else if (e.key === 'Escape') onCancelEdit();
            }}
            className="atlas-edit-input"
          />
          <LabelTooltip label={t('common.save')}>
            <Button variant="ghost" size="icon" className="atlas-collection-header-btn atlas-save-button" onClick={onSaveEdit}>
              <Check />
            </Button>
          </LabelTooltip>
          <LabelTooltip label={t('common.cancel')}>
            <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={onCancelEdit}>
              <X />
            </Button>
          </LabelTooltip>
        </div>
      ) : (
        <>
          <span className="atlas-item-name">
            {kind === 'tag' ? <Tag size={14} /> : <FolderOpen size={14} />}
            {item.name}
          </span>
          <div className="atlas-item-actions">
            <LabelTooltip label={t('am.row.moreActions')}>
              <Button
                variant="ghost"
                size="icon"
                className="atlas-collection-header-btn"
                onClick={(e) => { e.stopPropagation(); onOpenMenu(e); }}
              >
                <MoreVertical />
              </Button>
            </LabelTooltip>
          </div>
        </>
      )}
    </div>
  );
}
