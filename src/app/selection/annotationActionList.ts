import { annotationAuthor } from '../annotations/annotationAuthors';
import { groupable, ungroupable } from '../annotations/annotationGroups';
import { isLocked } from '../annotations/annotationLock';
import type { Annotation, TextAnnotation } from '../annotations/annotationTypes';
import { t } from '../i18n';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import type { ViewAtlasState } from '../storeFactory';
import { actionOf, PRIMARY_ORDER, WHOLE_SELECTION, type SelectionAction } from './selectionActions';

/** What the actions do to the scene. */
export type AnnotationActionStore = Pick<ViewAtlasState, 'updateAnnotations' | 'orderAnnotations' | 'groupAnnotations' | 'ungroupAnnotations' | 'duplicateMapObjects' | 'deleteAnnotations'>;

/** What the actions do beyond the drawings and texts themselves. */
export interface AnnotationActionExtras {
  /**
   * Everything selected, where tokens are selected with the drawings and texts: Duplicate and
   * Delete then act on all of it, as their keys do.
   */
  readonly whole?: { readonly ids: readonly string[]; remove(): void } | undefined;
  /** Under a finger: what a keyboard does elsewhere. */
  readonly touch?: { copy(): void; paste(): void; readonly canPaste: boolean } | undefined;
  /**
   * Under a finger: the point of a line the menu was opened on, where the line can spare it. A
   * keyboard removes it with Delete and a mouse with a double click; a finger has this row.
   */
  readonly point?: { remove(): void } | undefined;
}

const separator = (id: string): SelectionAction => ({ kind: 'row', id, row: MENU_SEPARATOR });

/**
 * What can be done with drawings and texts, one list for both: `selected` is every annotation the
 * actions change (the selection the right-click made or found), `clicked` the one under the
 * pointer. An action that switches something says what it will do: where every selected one is
 * hidden it shows them, else it hides them. `styles` are the rows that change how they look
 * (colour and size), which come after Edit; the bar under a selection has those and more. A locked
 * one takes nothing but its unlocking (`annotationLock.ts`): the actions speak of the others, and
 * where every selected one is locked only Unlock and Duplicate can be chosen. Group makes one
 * group of what is selected and Ungroup takes it apart; each can be chosen only where it changes
 * something. A drawing or text an online player made says so in a first row that does nothing,
 * where the player is known (`annotationAuthor`).
 */
export function annotationActions(
  selected: readonly Annotation[], clicked: Annotation | null, store: AnnotationActionStore, edit: (text: TextAnnotation) => void,
  styles: readonly ContextMenuEntry[] = [], extras: AnnotationActionExtras = {},
): SelectionAction[] {
  const ids = selected.map(({ id }) => id);
  if (ids.length === 0) return [];
  const free = selected.filter((annotation) => !isLocked(annotation));
  const locked = free.length === 0;
  // What an action changes is what is not locked: it says what it does to those.
  const changed = locked ? selected : free;
  const hidden = changed.every((annotation) => annotation.hidden);
  const onMap = changed.every((annotation) => annotation.layer === 'map');
  const group = extras.whole ? [...extras.whole.ids] : ids;
  const actions: SelectionAction[] = [];
  const author = annotationAuthor(clicked?.by ?? null);
  if (author !== null) {
    actions.push({ kind: 'run', id: 'author', enabled: false, label: t('draw.menu.drawnBy', { name: author }), icon: 'user', run: () => undefined }, separator('after-author'));
  }
  if (extras.point) {
    const { point } = extras;
    actions.push({ kind: 'run', id: 'remove-point', enabled: true, label: t('draw.menu.removePoint'), icon: 'circle-minus', run: () => point.remove() }, separator('after-point'));
  }
  if (clicked?.kind === 'text') {
    actions.push({
      kind: 'run', id: 'edit', enabled: !isLocked(clicked), label: t('draw.menu.edit'), icon: 'pencil',
      primary: { order: PRIMARY_ORDER.edit, label: t('common.edit') },
      run: () => edit(clicked),
    });
  }
  if (styles.length > 0) actions.push(...styles.map((row, index) => actionOf(`style-${index}`, row)), separator('after-styles'));
  actions.push(
    {
      kind: 'run', id: 'visibility', enabled: !locked,
      label: hidden ? t('draw.menu.show') : t('draw.menu.hide'),
      icon: hidden ? 'eye' : 'eye-off',
      run: () => store.updateAnnotations(ids, { hidden: hidden ? undefined : true }),
    },
    {
      kind: 'run', id: 'layer', enabled: !locked,
      label: onMap ? t('draw.menu.above') : t('draw.onMap'),
      icon: 'layers-2',
      run: () => store.updateAnnotations(ids, { layer: onMap ? undefined : 'map' }),
    },
    {
      kind: 'run', id: 'lock', enabled: true,
      label: locked ? t('draw.menu.unlock') : t('draw.lock'),
      icon: locked ? 'lock-open' : 'lock',
      run: () => store.updateAnnotations(ids, { locked: locked ? undefined : true }),
    },
    { kind: 'run', id: 'group', enabled: groupable(selected), label: t('draw.group'), icon: 'group', run: () => store.groupAnnotations(ids) },
    { kind: 'run', id: 'ungroup', enabled: ungroupable(selected), label: t('draw.ungroup'), icon: 'ungroup', run: () => store.ungroupAnnotations(ids) },
    separator('after-groups'),
    { kind: 'run', id: 'front', enabled: !locked, label: t('draw.toFront'), icon: 'bring-to-front', run: () => store.orderAnnotations(ids, 'front') },
    { kind: 'run', id: 'back', enabled: !locked, label: t('draw.toBack'), icon: 'send-to-back', run: () => store.orderAnnotations(ids, 'back') },
    separator('after-order'),
    {
      kind: 'run', id: WHOLE_SELECTION.duplicate, enabled: true, label: t('common.duplicate'), icon: 'files',
      primary: { order: PRIMARY_ORDER.duplicate, label: t('common.duplicate') },
      run: () => store.duplicateMapObjects(group),
    },
  );
  const { touch, whole } = extras;
  if (touch) {
    actions.push(
      { kind: 'run', id: WHOLE_SELECTION.copy, enabled: true, label: t('common.copy'), icon: 'copy', run: () => touch.copy() },
      { kind: 'run', id: WHOLE_SELECTION.paste, enabled: touch.canPaste, label: t('selection.paste'), icon: 'clipboard-paste', run: () => touch.paste() },
    );
  }
  actions.push({
    kind: 'run', id: WHOLE_SELECTION.delete, enabled: !locked || whole !== undefined, destructive: true, label: t('common.delete'), icon: 'trash',
    primary: { order: PRIMARY_ORDER.delete, label: t('common.delete') },
    run: () => (whole ? whole.remove() : store.deleteAnnotations(ids)),
  });
  return actions;
}
