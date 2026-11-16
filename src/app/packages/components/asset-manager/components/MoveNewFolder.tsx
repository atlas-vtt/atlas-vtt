import React, { useId } from 'react';
import { FolderPlus } from 'lucide-react';
import { Button } from '../../primitives/button';
import { t } from '../../../../i18n';

interface MoveNewFolderProps {
  /** The name field shows; otherwise only the button that opens it. */
  editing: boolean;
  onEdit: () => void;
  /** The name typed so far; the dialog keeps it, since its Move makes the folder too. */
  name: string;
  onName: (name: string) => void;
  /** Why the typed name cannot be taken, or null. */
  problem: string | null;
  /** Whether Create (and Enter) can make a folder of the typed name now. */
  canCreate: boolean;
  /** Makes the folder, which becomes the dialog's target. */
  onCreate: () => void;
  /** Makes the folder and moves the items into it: Enter in the field. */
  onCreateAndMove: () => void;
}

/**
 * The Move dialog's way to a first folder (decisions #28, #61): "New folder…" opens a name field in place, checked as
 * it is typed. Create makes the folder, which becomes the target; Enter (or the dialog's Move) makes it and moves the
 * items there in one step. Escape is the dialog's: it closes the field.
 */
export function MoveNewFolder({ editing, onEdit, name, onName, problem, canCreate, onCreate, onCreateAndMove }: MoveNewFolderProps): React.JSX.Element {
  const nameId = useId();
  const errorId = useId();
  if (!editing) {
    return (
      <Button variant="ghost" size="sm" className="atlas-move-new-folder" onClick={onEdit}>
        <FolderPlus size={14} />
        {t('am.move.newFolder')}
      </Button>
    );
  }
  return (
    <>
      <label htmlFor={nameId} className="atlas-asset-manager-move-label">{t('am.folder.name')}</label>
      <div className="atlas-move-new-folder-row">
        <input
          id={nameId}
          type="text"
          className="atlas-asset-manager-move-input"
          placeholder={t('am.folder.namePlaceholder')}
          value={name}
          onChange={(e) => onName(e.target.value)}
          aria-invalid={problem !== null || undefined}
          {...(problem ? { 'aria-describedby': errorId } : {})}
          autoFocus
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            onCreateAndMove();
          }}
        />
        <Button variant="secondary" size="sm" disabled={!canCreate} onClick={onCreate}>{t('am.folder.create')}</Button>
      </div>
      {problem && <p id={errorId} className="atlas-csm-hint atlas-csm-hint--error" role="alert">{problem}</p>}
    </>
  );
}
