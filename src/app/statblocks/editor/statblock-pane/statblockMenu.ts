import type { ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import type { PaneNote } from './usePaneNote';
import type { PaneTemplate } from './usePaneTemplate';
import { t } from '../../../i18n';

export interface StatblockMenuInput {
  note: PaneNote;
  paneTemplate: PaneTemplate;
  /** Opens the template editor on the note's template; unset where it can't open. */
  editTemplate: (() => void) | undefined;
  /** Opens Change template…; unset where the note can't be written. */
  changeTemplate: (() => void) | undefined;
  /** Copies the template for this statblock and opens the copy to be named. */
  duplicateTemplate: (() => void) | undefined;
  /** Shows the note's Properties again; unset while they show. */
  showProperties: (() => void) | undefined;
}

/**
 * The statblock's ⋯ menu (§7.2), in the card's corner: Edit template, Change
 * template…, Duplicate template and Show Properties, each only where it can
 * act. A note whose template is missing offers Change template… alone.
 */
export function statblockMenuEntries({ note, paneTemplate, editTemplate, changeTemplate, duplicateTemplate, showProperties }: StatblockMenuInput): ContextMenuEntry[] {
  if (note.kind !== 'atlas' || paneTemplate.status === 'loading') return [];
  const usable = paneTemplate.status === 'ok';
  return [
    ...(usable && editTemplate ? [{ type: 'item' as const, label: t('statblockEditor.editTemplate'), icon: 'pencil', onClick: editTemplate }] : []),
    ...(changeTemplate ? [{ type: 'item' as const, label: t('statblockEditor.changeTemplateMenu'), icon: 'replace', onClick: changeTemplate }] : []),
    ...(usable && duplicateTemplate ? [{ type: 'item' as const, label: t('statblockEditor.duplicateTemplate'), icon: 'copy', onClick: duplicateTemplate }] : []),
    ...(showProperties ? [{ type: 'item' as const, label: t('statblockEditor.showProperties'), icon: 'list', onClick: showProperties }] : []),
  ];
}
