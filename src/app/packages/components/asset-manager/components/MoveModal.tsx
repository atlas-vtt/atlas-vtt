import React, { useEffect, useRef, useState } from 'react';
import { Home } from 'lucide-react';
import type { Tab, Folder as FolderType } from '../types';
import { useDialogEscape } from '../../primitives/useDialogEscape';
import { useFocusTrap } from '../../primitives/useFocusTrap';
import { useFocusReturn } from '../hooks/useFocusReturn';
import { cardIn } from '../utils/cardFocus';
import { MoveFolderOption } from './MoveFolderOption';
import { MoveNewFolder } from './MoveNewFolder';
import { PickerDialog } from './PickerDialog';
import { PickerField } from './PickerField';
import { PickerOption } from './PickerOption';
import { folderNameProblem } from '../utils/folderName';
import { t } from '../../../../i18n';

export interface MoveModalProps {
  selectedAssetIds: string[];
  /** What the dialog moves, as the move's notice names it: "Rogue", "3 tokens". */
  movingWhat: string;
  folders: FolderType[];
  activeTab: Tab;
  moveTargetFolderId: string | null;
  setMoveTargetFolderId: (id: string | null) => void;
  moveFolderSearch: string;
  setMoveFolderSearch: (s: string) => void;
  moveFolderListOpen: boolean;
  setMoveFolderListOpen: (open: boolean) => void;
  onClose: () => void;
  /** Moves the items into this folder (null: the top level). */
  onConfirm: (targetFolderId: string | null) => void;
  /** The folder every item lies in (null: the top level); undefined where they lie in different ones. */
  currentFolderId?: string | null | undefined;
  /** Whether a new folder of this name would take the place of a file or folder already there. */
  isFolderNameTaken: (name: string) => boolean;
  /** Makes a folder in the open folder; resolves to its id, or null when none was made. */
  onCreateFolder: (name: string) => Promise<string | null>;
}

export function MoveModal({
  selectedAssetIds, movingWhat, folders, activeTab, moveTargetFolderId,
  setMoveTargetFolderId, moveFolderSearch, setMoveFolderSearch,
  moveFolderListOpen, setMoveFolderListOpen, onClose, onConfirm, currentFolderId, isFolderNameTaken, onCreateFolder,
}: MoveModalProps): React.JSX.Element {
  const windowRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [makingFolder, setMakingFolder] = useState(false);
  // Where focus goes back to, should the menu row that opened the dialog be gone: the card it acted for.
  const focus = useFocusReturn(windowRef, () => {
    const doc = windowRef.current?.ownerDocument;
    return doc ? cardIn(doc, selectedAssetIds[0]) : null;
  });
  const isCurrent = (folderId: string | null): boolean => currentFolderId !== undefined && folderId === currentFolderId;
  const newFolderProblem = folderNameProblem(newFolderName, isFolderNameTaken);
  // A name typed in the new folder's field is a target too: Move makes the folder and moves into it (decision #61).
  const newFolderReady = creatingFolder && !makingFolder && newFolderName.trim() !== '' && newFolderProblem === null;
  // Moving the items where they lie does nothing, so Move waits for another folder.
  const canMove = newFolderReady || (!makingFolder && !isCurrent(moveTargetFolderId));
  // The dialog opens on where the items lie, marked as such.
  useEffect(() => {
    if (currentFolderId !== undefined) setMoveTargetFolderId(currentFolderId);
  }, []);
  const moveTo = (folderId: string | null): void => {
    // The moved cards leave the folder: focus goes to the card beside them.
    focus.afterLeaving(selectedAssetIds);
    onConfirm(folderId);
  };
  const labelOf = (folderId: string | null): string =>
    (folderId === null ? t('am.move.root') : folders.find((folder) => folder.id === folderId)?.name ?? '');
  // The field shows the chosen folder once one is taken (WAI-ARIA combobox); that text is the value, not a search.
  const search = moveFolderSearch === labelOf(moveTargetFolderId) ? '' : moveFolderSearch.toLowerCase();
  const folderChoices = folders.filter((f) => f.type === activeTab
    && (!search || f.name.toLowerCase().includes(search) || f.path.toLowerCase().includes(search)));
  const showsRoot = !search || 'root folder'.includes(search) || labelOf(null).toLowerCase().includes(search);
  const choices = [...(showsRoot ? [null] : []), ...folderChoices.map((folder) => folder.id)];
  const choose = (folderId: string | null): void => {
    setMoveTargetFolderId(folderId);
    setMoveFolderSearch(labelOf(folderId));
  };

  const tabHasNoFolders = !folders.some((folder) => folder.type === activeTab);
  /** Makes the typed folder and takes it as the target; resolves to its id, or null when none was made. */
  const createFolder = async (): Promise<string | null> => {
    const name = newFolderName.trim();
    setMakingFolder(true);
    const id = await onCreateFolder(name).finally(() => setMakingFolder(false));
    if (id === null) return null;
    setCreatingFolder(false);
    setNewFolderName('');
    setMoveTargetFolderId(id);
    setMoveFolderSearch(name);
    return id;
  };
  const createAndSelect = (): void => {
    if (!newFolderReady) return;
    void createFolder().then((id) => { if (id !== null) fieldRef.current?.focus(); });
  };
  const confirm = (): void => {
    if (newFolderReady) {
      void createFolder().then((id) => { if (id !== null) moveTo(id); });
    } else if (canMove) moveTo(moveTargetFolderId);
  };

  // Escape closes the new folder's field or the open folder list first, then the dialog; never the window behind it.
  useDialogEscape(windowRef, () => {
    if (creatingFolder) {
      setCreatingFolder(false);
      fieldRef.current?.focus();
    } else if (moveFolderListOpen) setMoveFolderListOpen(false);
    else onClose();
  });
  useFocusTrap(windowRef);

  return (
    <PickerDialog windowRef={windowRef} title={t('am.move.title')} confirmLabel={t('am.move.move')} canConfirm={canMove} onConfirm={confirm} onClose={onClose}>
      <p className="atlas-asset-manager-move-info">{t('am.move.moving', { what: movingWhat })}</p>
      <div className="atlas-asset-manager-move-collections">
        <PickerField
          label={t('am.move.target')}
          placeholder={t('am.move.search')}
          fieldRef={fieldRef}
          text={moveFolderSearch}
          onText={setMoveFolderSearch}
          listOpen={moveFolderListOpen}
          setListOpen={setMoveFolderListOpen}
          choices={choices}
          chosen={moveTargetFolderId}
          choose={choose}
          onConfirm={confirm}
          keyOf={(folderId) => folderId ?? ''}
          noMatch={t('am.move.noMatch')}
          renderOption={(folderId, row) => {
            const folder = folderId === null ? undefined : folders.find((f) => f.id === folderId);
            return folder
              ? <MoveFolderOption folder={folder} searching={search !== ''} current={isCurrent(folder.id)} row={row} onSelect={() => choose(folder.id)} />
              : <PickerOption row={row} icon={<Home size={14} />} name={t('am.move.root')} current={isCurrent(null)} onSelect={() => choose(null)} />;
          }}
        />
        {tabHasNoFolders && (
          <MoveNewFolder
            editing={creatingFolder}
            onEdit={() => { setMoveFolderListOpen(false); setCreatingFolder(true); }}
            name={newFolderName}
            onName={setNewFolderName}
            problem={newFolderProblem}
            canCreate={newFolderReady}
            onCreate={createAndSelect}
            onCreateAndMove={() => { if (newFolderReady) confirm(); }}
          />
        )}
      </div>
    </PickerDialog>
  );
}
