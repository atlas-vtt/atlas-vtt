import { createContext, useContext } from 'react';
import type { App } from 'obsidian';
import type { InsertItem } from './insertItems';
import type { LabelPart } from './labelTargets';
import type { BlockSelection } from './selection';
import type { EditorSession, SessionSnapshot } from './sessionTypes';
import type { CollectionFieldKeys } from './useCollectionFieldKeys';

/**
 * What the template editor shares with the parts that float over and beside
 * the card (the dock, the tile toolbar and its Options), which read and change
 * the same session and the same selection.
 */
export interface TemplateEditorContextValue {
  app: App | undefined;
  session: EditorSession;
  snapshot: SessionSnapshot;
  selection: BlockSelection;
  /** Selects blocks; focus moves to the primary one in the canvas when `focus` is set. */
  select: (selection: BlockSelection, focus?: boolean) => void;
  /** Inserts a block after the selection and selects it (§6.1: its label stays closed). */
  insert: (item: InsertItem) => void;
  /** Opens a block's label for editing in the canvas; `part` picks one of a Metric's. */
  editLabel: (id: string, part?: LabelPart) => void;
  /** Says something in the view's live region. */
  announce: (text: string) => void;
  /** The collection context (§7.1): its notes' keys, its roles in questions. */
  collectionId: string | null;
  collectionKeys: CollectionFieldKeys;
  /** Opens the selected tile's Options, focusing the input named `focusKey` (`data-focus-key`) where given. */
  openOptions: (focusKey?: string) => void;
  /** Whether tiles' Options say what players may do with them (`usePlayersRow`). */
  playersRow?: boolean | undefined;
  /** The last request that a Table type its first cell. */
  tableTyping?: TableTypingRequest | null | undefined;
}

/** A request that the Table `blockId` type its first cell: raised by Enter on its tile, which names other tiles. */
export interface TableTypingRequest {
  blockId: string;
  count: number;
}

export const TemplateEditorContext = createContext<TemplateEditorContextValue | null>(null);

/** The template editor around a part; only parts rendered inside `TemplateEditor` may ask. */
export function useTemplateEditor(): TemplateEditorContextValue {
  const editor = useContext(TemplateEditorContext);
  if (!editor) throw new Error('A template editor part was rendered outside TemplateEditor.');
  return editor;
}
