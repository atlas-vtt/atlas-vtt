import React, { useRef, useState } from 'react';
import type { CollectionOption } from '../types';
import type { TransferMode } from '../../../../services/assetTransfer/transferPlan';
import { useDialogEscape } from '../../primitives/useDialogEscape';
import { useFocusTrap } from '../../primitives/useFocusTrap';
import { useFocusReturn } from '../hooks/useFocusReturn';
import { cardIn } from '../utils/cardFocus';
import { collectionsByName } from '../utils/collectionTransferActions';
import { CutTooltip, isCut } from '../../../../react/components/dm-screen/sound/CutTooltip';
import { CollectionGlyph } from './collectionGlyph';
import { PickerDialog } from './PickerDialog';
import { PickerField } from './PickerField';
import { PickerOption } from './PickerOption';
import { t } from '../../../../i18n';

export interface CollectionPickerDialogProps {
  mode: TransferMode;
  /** What goes, as the notice names it: "Rogue", "3 tokens". */
  movingWhat: string;
  /** The ids of what goes, whose first card takes focus back should the menu row that opened the dialog be gone. */
  assetIds: readonly string[];
  collections: readonly CollectionOption[];
  /** The collection the assets are in: marked, and the action waits for another. */
  currentCollectionId: string;
  onClose: () => void;
  onConfirm: (target: CollectionOption) => void;
}

/** A collection's whole name while its row cuts it, so two names that start alike stay apart. */
function cutName(row: HTMLElement): string | null {
  const name = row.querySelector<HTMLElement>('.atlas-move-folder-name');
  return name && isCut(name) ? name.textContent : null;
}

/**
 * Move to collection… and Copy to collection… (decision #41): the Move dialog's pattern for collections. It opens on
 * the collection the assets are in, marked "(current)"; the field searches the collections by name, and its list is
 * the Move dialog's (keys, Escape closing the list first). The transfer itself is the caller's (`transferToCollection`).
 */
export function CollectionPickerDialog({
  mode, movingWhat, assetIds, collections, currentCollectionId, onClose, onConfirm,
}: CollectionPickerDialogProps): React.JSX.Element {
  const windowRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState(currentCollectionId);
  const [text, setText] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const focus = useFocusReturn(windowRef, () => {
    const doc = windowRef.current?.ownerDocument;
    return doc ? cardIn(doc, assetIds[0]) : null;
  });

  const sorted = collectionsByName(collections);
  const nameOf = (id: string): string => sorted.find((collection) => collection.id === id)?.name ?? '';
  // The field shows the chosen collection once one is taken (WAI-ARIA combobox); that text is the value, not a search.
  const search = text === nameOf(chosen) ? '' : text.toLowerCase();
  const choices = sorted.filter((collection) => !search || collection.name.toLowerCase().includes(search)).map((collection) => collection.id);
  const target = sorted.find((collection) => collection.id === chosen);
  const canConfirm = target !== undefined && chosen !== currentCollectionId;

  const choose = (id: string): void => {
    setChosen(id);
    setText(nameOf(id));
  };
  const confirm = (): void => {
    if (!canConfirm) return;
    // Moved cards leave the collection shown: focus goes to the card beside them.
    if (mode === 'move') focus.afterLeaving(assetIds);
    onConfirm(target);
  };

  useDialogEscape(windowRef, () => {
    if (listOpen) setListOpen(false);
    else onClose();
  });
  useFocusTrap(windowRef);

  return (
    <PickerDialog
      windowRef={windowRef}
      className="atlas-asset-manager-collection-pick-modal"
      title={t(`transfer.pick.title.${mode}`)}
      confirmLabel={t(`transfer.pick.confirm.${mode}`)}
      canConfirm={canConfirm}
      onConfirm={confirm}
      onClose={onClose}
    >
      <p className="atlas-asset-manager-move-info">{t(`transfer.pick.info.${mode}`, { what: movingWhat })}</p>
      <div className="atlas-asset-manager-move-collections">
        <PickerField
          label={t('transfer.pick.target')}
          placeholder={t('creator.searchCollections')}
          fieldRef={fieldRef}
          text={text}
          onText={setText}
          listOpen={listOpen}
          setListOpen={setListOpen}
          choices={choices}
          chosen={chosen}
          choose={choose}
          onConfirm={confirm}
          keyOf={(id) => id}
          noMatch={t('creator.noCollections')}
          renderOption={(id, row) => (
            <PickerOption
              row={row}
              icon={<CollectionGlyph size={14} />}
              name={nameOf(id)}
              current={id === currentCollectionId}
              onSelect={() => choose(id)}
              wrap={(element) => <CutTooltip wholeOf={cutName}>{element}</CutTooltip>}
            />
          )}
        />
      </div>
    </PickerDialog>
  );
}
