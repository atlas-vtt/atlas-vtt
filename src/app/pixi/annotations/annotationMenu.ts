import { annotationAuthor } from '../../annotations/annotationAuthors';
import { groupable, ungroupable } from '../../annotations/annotationGroups';
import { isLocked } from '../../annotations/annotationLock';
import type { Annotation, TextAnnotation } from '../../annotations/annotationTypes';
import { t } from '../../i18n';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../react/components/context-menu/AtlasContextMenu';
import type { ViewAtlasState } from '../../storeFactory';

/** What the menu's rows do to the scene. */
export type AnnotationMenuStore = Pick<ViewAtlasState, 'updateAnnotations' | 'orderAnnotations' | 'groupAnnotations' | 'ungroupAnnotations' | 'duplicateMapObjects' | 'deleteAnnotations'>;

/**
 * The context menu of drawings and texts, one for both: `selected` is every annotation it changes
 * (the selection the right-click made or found), `clicked` the one under the pointer. A row that
 * switches something says what it will do: where every selected one is hidden it shows them, else
 * it hides them. No colours and no sizes: the tool's bars have them. A locked one takes nothing
 * but its unlocking (`annotationLock.ts`): the rows speak of the others, and where every selected
 * one is locked only Unlock and Duplicate can be chosen. Group makes one group of what is
 * selected and Ungroup takes it apart; each can be chosen only where it changes something.
 * A drawing or text an online player made says so in a first row that does nothing, where the
 * player is known (`annotationAuthor`).
 */
export function annotationMenu(selected: readonly Annotation[], clicked: Annotation | null, store: AnnotationMenuStore, edit: (text: TextAnnotation) => void): ContextMenuEntry[] {
  const ids = selected.map(({ id }) => id);
  if (ids.length === 0) return [];
  const free = selected.filter((annotation) => !isLocked(annotation));
  const locked = free.length === 0;
  // What a row changes is what is not locked: it says what it does to those.
  const changed = locked ? selected : free;
  const hidden = changed.every((annotation) => annotation.hidden);
  const onMap = changed.every((annotation) => annotation.layer === 'map');
  const entries: ContextMenuEntry[] = [];
  const author = annotationAuthor(clicked?.by ?? null);
  if (author !== null) entries.push({ type: 'item', label: t('draw.menu.drawnBy', { name: author }), icon: 'user', disabled: true, onClick: () => undefined }, MENU_SEPARATOR);
  if (clicked?.kind === 'text') entries.push({ type: 'item', label: t('draw.menu.edit'), icon: 'pencil', disabled: isLocked(clicked), onClick: () => edit(clicked) });
  entries.push(
    {
      type: 'item',
      label: hidden ? t('draw.menu.show') : t('draw.menu.hide'),
      icon: hidden ? 'eye' : 'eye-off',
      disabled: locked,
      onClick: () => store.updateAnnotations(ids, { hidden: hidden ? undefined : true }),
    },
    {
      type: 'item',
      label: onMap ? t('draw.menu.above') : t('draw.onMap'),
      icon: 'layers-2',
      disabled: locked,
      onClick: () => store.updateAnnotations(ids, { layer: onMap ? undefined : 'map' }),
    },
    {
      type: 'item',
      label: locked ? t('draw.menu.unlock') : t('draw.lock'),
      icon: locked ? 'lock-open' : 'lock',
      onClick: () => store.updateAnnotations(ids, { locked: locked ? undefined : true }),
    },
    { type: 'item', label: t('draw.group'), icon: 'group', disabled: !groupable(selected), onClick: () => store.groupAnnotations(ids) },
    { type: 'item', label: t('draw.ungroup'), icon: 'ungroup', disabled: !ungroupable(selected), onClick: () => store.ungroupAnnotations(ids) },
    MENU_SEPARATOR,
    { type: 'item', label: t('draw.toFront'), icon: 'bring-to-front', disabled: locked, onClick: () => store.orderAnnotations(ids, 'front') },
    { type: 'item', label: t('draw.toBack'), icon: 'send-to-back', disabled: locked, onClick: () => store.orderAnnotations(ids, 'back') },
    MENU_SEPARATOR,
    { type: 'item', label: t('common.duplicate'), icon: 'files', onClick: () => store.duplicateMapObjects(ids) },
    { type: 'item', label: t('common.delete'), icon: 'trash', destructive: true, disabled: locked, onClick: () => store.deleteAnnotations(ids) },
  );
  return entries;
}
