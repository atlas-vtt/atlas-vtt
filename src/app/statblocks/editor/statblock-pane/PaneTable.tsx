import React, { useReducer } from 'react';
import type { ScoresBlock } from '../../model/templateTypes';
import type { TableLook } from '../../render/blocks/ScoresView';
import { shownGrid, type ShownTable } from '../../render/values/shownTable';
import { noteTable } from '../../values/tableValues';
import { EditableTable } from '../table/EditableTable';
import type { TableHost } from '../table/tableHost';
import { usePaneEdit } from './paneEditContext';
import { paneRoom, writeTable } from './tableWrites';

/**
 * A Table in the statblock pane: typed cell by cell into the note, its rows
 * and columns changed where the template lets statblocks change them. Every
 * change is one write of the table's value; the first one gives a statblock
 * that showed its template's starting table a copy of its own. Until the note
 * holds a write, the table draws what was written, so a new row is there to
 * type in at once.
 */
export function PaneTable({ block, shown, look }: { block: ScoresBlock; shown: ShownTable; look: TableLook }): React.JSX.Element {
  const pane = usePaneEdit();
  const [, written] = useReducer((count: number) => count + 1, 0);
  const field = pane.spots.byBlock.get(block.id)?.find((each) => each.key === block.field);
  if (!field || !pane.writable) return <EditableTable block={block} shown={shown} look={look} host={null} />;
  const fresh = pane.readFresh(field).value;
  const drawn = fresh === pane.read(field).value ? shown : shownGrid(block, field, noteTable(fresh, field), pane.sheet);
  const editing = pane.editing?.blockId === block.id ? pane.editing.cell : undefined;
  const host: TableHost = {
    name: field.label,
    grid: () => noteTable(pane.readFresh(field).value, field),
    room: paneRoom(field),
    active: editing === undefined || editing === 'last' ? null : editing,
    open: (at) => pane.start({ blockId: block.id, field: field.key, cell: at }),
    close: (refocus) => pane.stop(refocus),
    leave: (at) => pane.leave(block.id, at),
    commit: (grid, said) => {
      void writeTable(pane, field, grid);
      written();
      if (said) pane.announce(said);
    },
    exit: (step) => pane.move(field.key, step),
    announce: pane.announce,
    pending: (commit) => {
      const pending = async (): Promise<void> => commit();
      pane.setPending(pending);
      return () => pane.releasePending(pending);
    },
  };
  return <EditableTable block={block} shown={drawn} look={look} host={host} />;
}

/** The pane's `ValueEditing.table`. */
export function renderPaneTable(block: ScoresBlock, shown: ShownTable, look: TableLook): React.ReactNode {
  return <PaneTable block={block} shown={shown} look={look} />;
}
