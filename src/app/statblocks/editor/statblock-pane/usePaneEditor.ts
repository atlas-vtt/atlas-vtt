import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { App } from 'obsidian';
import type { FieldKey, FieldValue, StatblockTemplate, TemplateField } from '../../model/templateTypes';
import { deepEqual } from '../../notes/listIdentity';
import type { NotePatch } from '../../notes/patchTypes';
import type { BlockChrome } from '../../render/blockChrome';
import { foldedIds, type FoldedBlock } from '../../render/foldRule';
import { sheetState } from '../../render/sheetState';
import type { ValueEditing } from '../../render/valueSlot';
import { readField, type FieldRead, type FieldRecord } from '../../values/fieldValues';
import type { PaneServices } from '../paneServices';
import { sameCell } from '../table/tableHost';
import { editableSpots, neighbourSpot, type EditableSpots } from './editableSpots';
import { tableCell } from './tableWrites';
import { entryList, moveEntryToPatch } from './entryPatches';
import type { EditTarget, FieldConflict, ListMover, PaneEditController } from './paneEditContext';
import { paneChrome } from './paneChrome';
import { renderPaneCounters } from './PaneCounters';
import { renderPaneAddEntry, renderPaneEntry } from './PaneEntry';
import { renderPaneRecovery } from './PaneRecovery';
import { renderPaneTrack, renderPaneTracked } from './PaneTracked';
import { renderPaneSlot } from './PaneSlot';
import { renderPaneTable } from './PaneTable';
import type { PendingCommit } from './paneTypes';
import { fieldPatches } from './valuePatches';

export interface PaneEditorOptions {
  app: App;
  services: PaneServices;
  notePath: string;
  collectionId: string | null;
  template: StatblockTemplate;
  record: FieldRecord;
  writable: boolean;
  pendingCommit: PendingCommit;
  /** The card's element, where focus returns after editing. */
  cardRef: RefObject<HTMLElement | null>;
  /** Sections folded into chips under the card: not drawn, so none of their values is a stop. */
  folded: readonly FoldedBlock[];
  /** Unfolds a section in place (a chip), or folds it again once its values were cleared. */
  setUnfolded: (blockId: string, unfolded: boolean) => void;
  /** Tab past the last value, or Shift+Tab before the first. */
  onExit: (step: 1 | -1) => void;
  /** Why the last write failed, or null once one succeeds. */
  onWriteProblem: (problem: string | null) => void;
  announce: (text: string) => void;
}

export interface PaneEditor {
  controller: PaneEditController;
  chrome: BlockChrome;
  valueEditing: ValueEditing;
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** A Table is always typed in one of its cells: its first (or `last`) where none is named, else the nearest to the one named. */
function inCell(target: EditTarget, spots: EditableSpots, read: (field: TemplateField) => FieldRead): EditTarget {
  const field = spots.byBlock.get(target.blockId)?.find((each) => each.key === target.field);
  if (!spots.tables.has(target.blockId) || !field) return target.cell === undefined ? target : { ...target, cell: undefined };
  const cell = tableCell(field, read(field).value, target.cell);
  return sameCell(cell, target.cell === 'last' ? null : target.cell) ? target : { ...target, cell };
}

/** A write of the pane's own the note may not hold yet: what it started from and what it wrote. */
interface OwnWrite {
  base: FieldValue | undefined;
  mine: FieldValue | undefined;
}

/** Rendering a value's slot never changes: what it shows comes from the controller's context. */
const VALUE_EDITING: ValueEditing = {
  slot: renderPaneSlot, entry: renderPaneEntry, addEntry: renderPaneAddEntry, table: renderPaneTable, counters: renderPaneCounters,
  recovery: renderPaneRecovery, tracked: renderPaneTracked, track: renderPaneTrack,
};

/**
 * The pane's editing state (§7.6, §8.5, §8.6): which value is being edited,
 * the conflicts the note reported, and the writes, each a set of patches
 * whose base is the value the edit started from.
 */
export function usePaneEditor(options: PaneEditorOptions): PaneEditor {
  const { app, services, notePath, collectionId, template, record, writable, pendingCommit, cardRef, folded, setUnfolded } = options;
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [conflicts, setConflicts] = useState<ReadonlyMap<FieldKey, FieldConflict>>(new Map());
  // The same set while the same sections are folded, so the card renders again only when that changes.
  const foldedRef = useRef<ReadonlySet<string>>(new Set());
  const foldedNow = foldedIds(folded);
  if (!sameIds(foldedRef.current, foldedNow)) foldedRef.current = foldedNow;
  const foldedSet = foldedRef.current;
  const sheet = useMemo(() => sheetState({ template, record, mode: 'editing', folded: foldedSet }), [template, record, foldedSet]);
  const spots = useMemo(() => editableSpots(template, sheet), [template, sheet]);
  const latest = useRef({ record, options, conflicts });
  latest.current = { record, options, conflicts };
  const refocus = useRef<string | null>(null);
  const movers = useRef(new Map<FieldKey, ListMover>());
  const ownWrites = useRef(new Map<FieldKey, OwnWrite>());

  useEffect(() => {
    const blockId = refocus.current;
    if (!blockId) return;
    refocus.current = null;
    cardRef.current?.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)?.focus();
  });

  // A pane that can no longer write (its template is still loading, the note went) leaves no input open.
  useEffect(() => {
    if (!writable) setEditing(null);
  }, [writable]);

  const read = useCallback((field: TemplateField) => readField(latest.current.record, field), []);

  const readFresh = useCallback((field: TemplateField): FieldRead => {
    const now = readField(latest.current.record, field);
    const own = ownWrites.current.get(field.key);
    if (!own) return now;
    if (deepEqual(now.value, own.base)) return { value: own.mine, key: field.key, viaFormerKey: false };
    // The note took the write, or something else changed it since: what it holds is the value.
    ownWrites.current.delete(field.key);
    return now;
  }, []);

  const setConflict = useCallback((key: FieldKey, conflict: FieldConflict | null): void => {
    setConflicts((previous) => {
      if (!conflict && !previous.has(key)) return previous;
      const next = new Map(previous);
      if (conflict) next.set(key, conflict);
      else next.delete(key);
      return next;
    });
  }, []);

  const write = useCallback(async (
    field: TemplateField,
    patches: readonly NotePatch[],
    edit?: { base: FieldValue | undefined; mine: FieldValue | undefined },
  ): Promise<void> => {
    const current = latest.current.options;
    if (!patches.length || !current.writable) return;
    const own = edit ? { base: edit.base, mine: edit.mine } : null;
    if (own) ownWrites.current.set(field.key, own);
    const outcome = await services.writer.write(notePath, patches);
    if ((outcome.conflicts.length || outcome.problem) && ownWrites.current.get(field.key) === own) ownWrites.current.delete(field.key);
    if (outcome.conflicts.length) setConflict(field.key, { ...edit, canKeepMine: edit !== undefined });
    else setConflict(field.key, null);
    current.onWriteProblem(outcome.problem);
  }, [services, notePath, setConflict]);

  const stop = useCallback((focus: boolean): void => {
    setEditing((target) => {
      if (focus && target) refocus.current = target.blockId;
      return null;
    });
  }, []);

  const controller = useMemo((): PaneEditController => ({
    app,
    notePath,
    collectionId,
    spots,
    sheet,
    editing,
    writable,
    record,
    conflicts,
    read,
    readFresh,
    start: (target) => { if (latest.current.options.writable) setEditing(inCell(target, spots, readFresh)); },
    stop,
    leave: (blockId, cell) => setEditing((target) => {
      const same = target?.blockId === blockId && (cell === undefined || (target.cell !== 'last' && sameCell(target.cell, cell)));
      return same ? null : target;
    }),
    move: (from, step) => {
      const spot = neighbourSpot(spots.order, from, step);
      if (spot) {
        // Shift+Tab into a Table goes to its last cell, as it goes to a value's end.
        setEditing(inCell({ blockId: spot.blockId, field: spot.field.key, ...(step < 0 && { cell: 'last' as const }) }, spots, readFresh));
        return;
      }
      setEditing(null);
      latest.current.options.onExit(step);
    },
    write,
    keepMine: (field) => {
      const conflict = latest.current.conflicts.get(field.key);
      if (!conflict?.canKeepMine) return;
      const now = read(field);
      void write(field, fieldPatches(field.key, now, conflict.mine), { base: now.value, mine: conflict.mine });
    },
    keepNotes: (field) => setConflict(field.key, null),
    setPending: (commit) => { pendingCommit.current = commit; },
    releasePending: (commit) => {
      if (pendingCommit.current === commit) pendingCommit.current = null;
    },
    announce: (text) => latest.current.options.announce(text),
    moveEntry: (field, from, to) => {
      const mover = movers.current.get(field.key);
      if (mover) {
        mover(from, to);
        return;
      }
      const now = read(field);
      const patch = moveEntryToPatch(now.key, entryList(now.value), from, to);
      if (patch) void write(field, [patch]);
    },
    registerMover: (key, mover) => {
      movers.current.set(key, mover);
      return () => {
        if (movers.current.get(key) === mover) movers.current.delete(key);
      };
    },
    folded,
    foldedSet,
    setUnfolded,
  }), [app, notePath, collectionId, spots, sheet, editing, writable, record, conflicts, read, readFresh, stop, write, setConflict, pendingCommit, folded, foldedSet, setUnfolded]);

  const chrome = useMemo(() => paneChrome(spots, editing, writable, controller.start), [spots, editing, writable, controller.start]);
  return { controller, chrome, valueEditing: VALUE_EDITING };
}
