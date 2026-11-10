import React, { useContext, useEffect, useRef, useState } from 'react';
import { tableParts, withTemplateTable } from '../../model/tableColumns';
import type { CellAt } from '../../model/tableGrid';
import type { ScoresBlock } from '../../model/templateTypes';
import type { TableLook } from '../../render/blocks/ScoresView';
import type { ShownTable } from '../../render/values/shownTable';
import { EditableTable } from '../table/EditableTable';
import { firstCell, sameCell, walkOf, type TableHost, type TableRoom } from '../table/tableHost';
import { TemplateEditorContext } from './editorContext';
import { t } from '../../../i18n';

/** The template editor makes every change a statblock may make, and aligns columns too. */
const TEMPLATE_ROOM: TableRoom = { rows: true, columns: true, names: true, align: true };

/** The host of a Table not named yet: its chrome shows, and nothing it offers changes anything. */
function inertHost(shown: ShownTable): TableHost {
  const nothing = (): void => undefined;
  return {
    name: t('templateEditor.primitive.table'), grid: () => shown.grid, room: TEMPLATE_ROOM, active: null,
    open: nothing, close: nothing, leave: nothing, commit: nothing, exit: nothing, announce: nothing,
  };
}

/**
 * A Table in the template editor: its starting table, typed and shaped as
 * Obsidian edits a table, each change one undo step of the template. Every
 * new statblock starts with what it holds. Outside the editor (a preview of
 * the card) and in a template that takes no edits it is drawn as the card
 * draws it.
 */
export function TemplateTable({ block, shown, look }: { block: ScoresBlock; shown: ShownTable; look: TableLook }): React.JSX.Element {
  const editor = useContext(TemplateEditorContext);
  const [active, setActive] = useState<CellAt | null>(null);
  // Enter on the tile types its first cell; only a new request does, never a change of the table.
  const request = editor?.tableTyping;
  const first = useRef<CellAt>(firstCell(walkOf(shown.grid, shown.header && look === 'grid', TEMPLATE_ROOM)));
  first.current = firstCell(walkOf(shown.grid, shown.header && look === 'grid', TEMPLATE_ROOM));
  useEffect(() => {
    if (request?.blockId === block.id) setActive(first.current);
  }, [request, block.id]);
  if (!editor || editor.snapshot.readOnly) return <EditableTable block={block} shown={shown} look={look} host={null} />;
  // A Table being placed has no field until it is named: drawn with its handles and add bars as once named, inert meanwhile.
  if (tableParts(editor.snapshot.template, block.id) === undefined) return <EditableTable block={block} shown={shown} look={look} host={inertHost(shown)} />;
  const { session } = editor;
  const host: TableHost = {
    name: tableParts(editor.snapshot.template, block.id)?.field.label ?? t('templateEditor.primitive.table'),
    grid: () => tableParts(session.getSnapshot().template, block.id)?.grid ?? shown.grid,
    room: TEMPLATE_ROOM,
    active,
    open: (at) => {
      if (!editor.selection.includes(block.id)) editor.select([block.id], false);
      setActive(at);
    },
    close: (refocus) => {
      setActive(null);
      if (refocus) editor.select([block.id], true);
    },
    leave: (at) => setActive((now) => (sameCell(now, at) ? null : now)),
    commit: (grid, said) => {
      session.apply((template) => withTemplateTable(template, block.id, grid));
      if (said) editor.announce(said);
    },
    exit: () => {
      setActive(null);
      editor.select([block.id], true);
    },
    announce: editor.announce,
  };
  return <EditableTable block={block} shown={shown} look={look} host={host} />;
}

/** The template editor's `ValueEditing.table`. */
export function renderTemplateTable(block: ScoresBlock, shown: ShownTable, look: TableLook): React.ReactNode {
  return <TemplateTable block={block} shown={shown} look={look} />;
}
