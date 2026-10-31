import { useCallback, useRef } from 'react';
import type { StatblockTemplate, TemplateField } from '../../model/templateTypes';
import { entryItemKeys } from '../../values/entryKeys';
import { scrollerOf } from '../dnd/autoScroll';
import { droppedIndex } from '../dnd/listDragGeometry';
import { useListDrag } from '../dnd/useListDrag';
import { ITEM_SELECTOR } from '../interaction/useSurfaceHover';
import type { HoverTarget } from '../interaction/hoverStore';
import { entryList } from './entryPatches';
import { fieldByKey } from '../../model/fieldKeys';
import { findBlock } from '../../model/treeQueries';
import { keyedEntryItems } from '../../values/entryKeys';
import { entryName } from '../../values/entryValues';
import { singular } from '../../values/entryNoun';
import type { PaneEditController } from './paneEditContext';
import { t } from '../../../i18n';

/** The ability a handle names, with its list's field; null where the note no longer holds it. */
function findEntry(template: StatblockTemplate, pane: PaneEditController, blockId: string, itemKey: string): { field: TemplateField; name: string } | null {
  const block = findBlock(template.layout.blocks, blockId)?.block;
  const field = block?.type === 'entries' ? fieldByKey(template.fields, block.field) : undefined;
  const found = field ? keyedEntryItems(pane.read(field).value).find((entry) => entry.key === itemKey) : undefined;
  if (!field || !found) return null;
  return { field, name: entryName(found.item, field.entry) ?? (singular(field.label) || 'entry').toLowerCase() };
}

/** The clamp's hint is said once per session: a second pull against the list's edge is no surprise. */
let pullHintSaid = false;

export interface PaneItemDragInput {
  pane: PaneEditController;
  template: StatblockTemplate;
  /** Shows the clamp's hint by the list (§7.2). */
  hint: (text: string) => void;
}

/**
 * Dragging an ability by its handle (spec §7.2), at rest and while an ability
 * of the list is being typed: held in its own list, dropped as one move
 * patch by the ability's identity, or through the open list editor, which
 * takes the text being typed along.
 */
export function usePaneItemDrag({ pane, template, hint }: PaneItemDragInput): (target: HoverTarget, handle: HTMLElement, event: PointerEvent) => void {
  const drag = useListDrag();
  const latest = useRef({ pane, template, hint });
  latest.current = { pane, template, hint };

  return useCallback((target: HoverTarget, handle: HTMLElement, event: PointerEvent): void => {
    const frame = target.element.closest<HTMLElement>('[data-block-id]');
    const { pane: current, template: shown } = latest.current;
    const found = target.itemKey ? findEntry(shown, current, target.blockId, target.itemKey) : null;
    if (!frame || !found || !target.itemKey) return;
    const items = (): HTMLElement[] => [...frame.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
    const keys = (): string[] => items().map((item) => item.getAttribute('data-item-key') ?? '');
    const list = frame.querySelector('.atlas-sb-heading')?.textContent?.trim() || found.field.label;
    const from = (): number => keys().indexOf(target.itemKey ?? '');
    drag.press({
      items,
      itemKey: target.itemKey,
      scroller: scrollerOf(frame),
      onStart: () => current.announce(t('statblockEditor.pickedUpIn', { name: found.name, n: from() + 1, count: keys().length, list })),
      onGap: (gap, count) => {
        if (gap !== null) current.announce(`${found.name}, ${droppedIndex(from(), gap) + 1} of ${count}.`);
      },
      onPull: () => {
        if (pullHintSaid) return;
        pullHintSaid = true;
        const text = `${found.name} stays in its list.`;
        latest.current.hint(text);
        current.announce(text);
      },
      onDrop: (fromAt, gap) => {
        const drawn = keys();
        const toAt = droppedIndex(fromAt, gap);
        const stored = entryItemKeys(entryList(latest.current.pane.read(found.field).value));
        const fromIndex = stored.indexOf(drawn[fromAt] ?? '');
        const toIndex = stored.indexOf(drawn[toAt] ?? '');
        if (fromIndex < 0 || toIndex < 0) return;
        latest.current.pane.moveEntry(found.field, fromIndex, toIndex);
        latest.current.pane.announce(t('statblockEditor.droppedAt', { name: found.name, n: toAt + 1, count: drawn.length }));
      },
      onCancel: (started) => {
        if (started) latest.current.pane.announce(t('statblockEditor.notMoved'));
      },
    }, handle, event);
  }, [drag]);
}
