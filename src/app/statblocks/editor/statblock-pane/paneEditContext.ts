import { createContext, useContext } from 'react';
import type { App } from 'obsidian';
import type { CellAt } from '../../model/tableGrid';
import type { FieldKey, FieldValue, TemplateField } from '../../model/templateTypes';
import type { NotePatch } from '../../notes/patchTypes';
import type { FoldedBlock } from '../../render/foldRule';
import type { SheetState } from '../../render/sheetState';
import type { FieldRead, FieldRecord } from '../../values/fieldValues';
import type { EditableSpots } from './editableSpots';

/** The value being edited: a field in one block, for entries the one ability being typed, for a Table the one cell. */
export interface EditTarget {
  blockId: string;
  field: FieldKey;
  /** Table: the cell typed; its first when unset, its last for `last` (Shift+Tab from the value after it). */
  cell?: CellAt | 'last' | undefined;
  /** Entries: the ability edited, counted as the card draws them; the first when unset. */
  entry?: number | undefined;
  /** Entries: a new ability starts right after `entry` ("Add action below"), or first in an empty list. */
  add?: boolean | undefined;
  /**
   * Entries: the ability is found by its value rather than its place, once the
   * note holds it (a move or a new ability being written): until then the
   * list is drawn as it is and nothing is typed into a neighbour.
   */
  anchor?: FieldValue | undefined;
  /** Entries: the part focused, and where its caret stands. */
  part?: 'name' | 'text' | undefined;
  caret?: readonly [number, number] | undefined;
}

/** Moves an entry of a list from one stored place to another; the list editor's takes the text being typed along. */
export type ListMover = (from: number, to: number) => void;

/** A commit the note refused because the value changed there since the edit began (§8.6). */
export interface FieldConflict {
  /** What the edit started from and what it wanted; both unset for list and entry changes. */
  base?: FieldValue | undefined;
  mine?: FieldValue | undefined;
  /** Whether "Keep mine" can write the edit again over what the note holds now. */
  canKeepMine: boolean;
}

/** What a value's input needs from the pane: the note's values, where to write, and how to move on. */
export interface PaneEditController {
  app: App;
  notePath: string;
  /** The collection the pane works for: the token socket links its tokens. Null until resolved. */
  collectionId: string | null;
  spots: EditableSpots;
  /** The card's state as the pane reads it: which blocks show a fallback in place of their values. */
  sheet: SheetState;
  editing: EditTarget | null;
  /** False while the note cannot be written (no partner, deleted, broken YAML): inputs keep their text but write nothing. */
  writable: boolean;
  /** The note's values as they are now. */
  record: FieldRecord;
  conflicts: ReadonlyMap<FieldKey, FieldConflict>;
  /** What `field` holds now, through its former keys. */
  read: (field: TemplateField) => FieldRead;
  /**
   * What `field` holds once the pane's own last write of it has landed: the value it wrote while the
   * note still holds what that write started from, else what the note holds. A Table's next cell
   * builds on the cell just committed before the note has taken it.
   */
  readFresh: (field: TemplateField) => FieldRead;
  start: (target: EditTarget) => void;
  /** Leaves editing; `refocus` returns focus to the value's block. */
  stop: (refocus: boolean) => void;
  /** Leaves editing if `blockId` (and for a Table `cell`) is still what is being edited (focus left it). */
  leave: (blockId: string, cell?: CellAt) => void;
  /** Tab and Shift+Tab: the next or previous value in the template's field order, else out of the card. */
  move: (from: FieldKey, step: 1 | -1) => void;
  /**
   * Writes patches for one field. `mine` is the whole value the edit wants,
   * which "Keep mine" writes again; unset for list and entry changes.
   */
  write: (field: TemplateField, patches: readonly NotePatch[], edit?: { base: FieldValue | undefined; mine: FieldValue | undefined }) => Promise<void>;
  keepMine: (field: TemplateField) => void;
  /** "Use the note's": drops the conflict; the note's value stays. */
  keepNotes: (field: TemplateField) => void;
  /** The focused input's commit, run when the pane closes mid-word. */
  setPending: (commit: () => Promise<void>) => void;
  /** Forgets `commit` unless another input has registered since. */
  releasePending: (commit: () => Promise<void>) => void;
  /** Says something to assistive technology in the pane's live region ("Deleted Bite. Press Ctrl+Z to undo."). */
  announce: (text: string) => void;
  /** Moves an entry of `field` (a drag's drop): through the list editor while it is open, else as one move patch. */
  moveEntry: (field: TemplateField, from: number, to: number) => void;
  /** The open list editor of `key` takes the moves of its list; returns the function that lets go. */
  registerMover: (key: FieldKey, mover: ListMover) => () => void;
  /** Sections folded into chips under the card (§8.2), in reading order. */
  folded: readonly FoldedBlock[];
  /** Their ids, as the card takes them. */
  foldedSet: ReadonlySet<string>;
  /** Unfolds a section in place, sticky for the panel's life on this note; false folds it again (after Clear). */
  setUnfolded: (blockId: string, unfolded: boolean) => void;
}

export const PaneEditContext = createContext<PaneEditController | null>(null);

export function usePaneEdit(): PaneEditController {
  const pane = useContext(PaneEditContext);
  if (!pane) throw new Error('A statblock value input was rendered outside the statblock pane.');
  return pane;
}
