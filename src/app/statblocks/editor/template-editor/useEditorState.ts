/**
 * The template editor's own state beside the session (§7.6): the selection,
 * where focus goes, the open label, the insert menu, the wash of a block just
 * inserted, the delete toast and the live region; and the actions that tie
 * them to session edits.
 */

import { useCallback, useRef, useState, type RefObject } from 'react';
import { findBlock } from '../../model/treeQueries';
import type { StatblockTemplate } from '../../model/templateTypes';
import { useAnnouncer } from './announcer';
import { insertCatalogueBlock, type InsertOutcome, type InsertPlace } from './blockActions';
import { boxIn, type CanvasGap } from './canvasGaps';
import { blockFrame } from './editorChrome';
import type { Box } from './gapGeometry';
import type { InsertItem } from './insertItems';
import { existingSelection, NO_SELECTION, primaryOf, type BlockSelection } from './selection';
import type { EditorSession, SessionSnapshot } from './sessionTypes';
import type { CollectionFieldKeys } from './useCollectionFieldKeys';
import { useLabelEditing, type LabelEditingState } from './useLabelEditing';
import { useBlockNaming, type NamePrompt } from './naming/useBlockNaming';
import { t } from '../../../i18n';

export interface InsertMenuState {
  /** Counts the openings: each is a fresh menu, even while the last one is still fading out. */
  opening: number;
  place: InsertPlace;
  /** Where the menu hangs from, in the editor layer's coordinates. */
  anchor: Box;
  /** Focus goes back here when the menu closes without inserting. */
  returnFocus: HTMLElement | null;
}

export interface EditorStateInput {
  session: EditorSession;
  snapshot: SessionSnapshot;
  collectionKeys: CollectionFieldKeys;
  stageRef: RefObject<HTMLElement | null>;
  /** The layer over the editor that floating parts (toolbar, insert menu) are drawn in. */
  layer: HTMLElement | null;
  initialSelection?: BlockSelection | undefined;
}

export interface EditorState extends LabelEditingState {
  selection: BlockSelection;
  focusRequest: { id: string | null; count: number };
  select: (selection: BlockSelection, focus?: boolean) => void;
  settle: (outcome: InsertOutcome, focusPrimary?: boolean) => void;
  /** The tile just placed asking for its name, while it does. */
  naming: NamePrompt | null;
  drawn: (id: string) => boolean;
  said: string;
  announce: (text: string | undefined) => void;
  insertMenu: InsertMenuState | null;
  openInsert: (place?: InsertPlace, anchor?: Box) => void;
  openInsertAtGap: (gap: CanvasGap, line: Box) => void;
  closeInsert: () => void;
  insert: (item: InsertItem, place?: InsertPlace) => void;
  washId: string | null;
  clearWash: () => void;
  toast: { text: string; after: StatblockTemplate } | null;
  dismissToast: () => void;
  /** Until the first insert, the hint line shows (§7.9). */
  hinted: boolean;
}

/** "Speed" → "Deleted Speed."; "3 blocks" → "Deleted 3 blocks.", as the note panel says it. */
function deletedText(what: string): string {
  return t('templateEditor.deletedWhat', { what });
}

export function useEditorState(input: EditorStateInput): EditorState {
  const { session, snapshot, stageRef, layer } = input;
  const { said, announce } = useAnnouncer();
  const [rawSelection, setSelection] = useState<BlockSelection>(input.initialSelection ?? NO_SELECTION);
  const [focusRequest, setFocusRequest] = useState({ id: null as string | null, count: 0 });
  const [insertMenu, setInsertMenu] = useState<InsertMenuState | null>(null);
  const [washId, setWashId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; after: StatblockTemplate } | null>(null);
  const [hinted, setHinted] = useState(true);
  const openings = useRef(0);
  const selection = existingSelection(snapshot.template, rawSelection);
  const latest = useRef({ selection, snapshot, insertMenu });
  latest.current = { selection, snapshot, insertMenu };

  const select = useCallback((next: BlockSelection, focus = true): void => {
    setSelection(next);
    if (focus) setFocusRequest((request) => ({ id: primaryOf(next), count: request.count + 1 }));
  }, []);

  const drawn = useCallback((id: string): boolean => {
    const stage = stageRef.current;
    return stage !== null && blockFrame(stage, id) !== null;
  }, [stageRef]);

  const labels = useLabelEditing({ session, snapshot, collectionKeys: input.collectionKeys, select, announce, drawn });

  const { naming, askName } = useBlockNaming({ session, template: snapshot.template, commit: labels.commitLabelText, select });

  /**
   * Takes an edit's outcome. An insert selects the new block; one placed from
   * the kinds asks for its name in a popover under it, which keeps focus and
   * without a name takes the tile away again, and any other shows its
   * toolbar. The label itself never opens (spec §6.1).
   */
  const settle = useCallback((outcome: InsertOutcome, focusPrimary = false): void => {
    // Where the editor stood before a tile placed to be named: letting it go gives that back (the insert menu's opener too).
    const doc = stageRef.current?.doc;
    const active = doc?.activeElement;
    const focus = latest.current.insertMenu?.returnFocus ?? (active?.instanceOf(HTMLElement) && active !== doc?.body ? active : null);
    const before = { selection: latest.current.selection, focus };
    if (outcome.select !== undefined) select(outcome.select, outcome.toName === undefined);
    else if (focusPrimary) select(latest.current.selection);
    if (outcome.toName !== undefined) askName(outcome.toName, outcome.placement, before);
    else outcome.placement?.keep();
    announce(outcome.announce);
    if (outcome.deleted) setToast({ text: deletedText(outcome.deleted), after: session.getSnapshot().template });
    if (outcome.inserted) {
      setWashId(outcome.inserted);
      setHinted(false);
    }
  }, [select, announce, session, askName, stageRef]);

  /** Where a floating part hangs below a box of the stage, in the layer's coordinates. */
  const toLayer = useCallback((box: Box): Box => {
    const stage = stageRef.current;
    if (!stage || !layer) return box;
    const from = stage.getBoundingClientRect();
    const to = layer.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
  }, [stageRef, layer]);

  const openInsert = useCallback((place?: InsertPlace, anchor?: Box): void => {
    const stage = stageRef.current;
    if (!stage) return;
    const primary = primaryOf(latest.current.selection);
    const frame = primary ? blockFrame(stage, primary) : null;
    const below = anchor ?? (frame ? boxIn(stage, frame) : { left: 0, top: 0, right: 0, bottom: 0 });
    const active = stage.doc.activeElement;
    openings.current += 1;
    setInsertMenu({
      opening: openings.current,
      place: place ?? { after: primary },
      anchor: toLayer({ ...below, top: below.bottom }),
      returnFocus: active?.instanceOf(HTMLElement) ? active : null,
    });
  }, [stageRef, toLayer]);

  const openInsertAtGap = useCallback((gap: CanvasGap, line: Box): void => {
    const found = findBlock(latest.current.snapshot.template.layout.blocks, gap.nextId);
    if (!found) return;
    openInsert({ at: { parentId: gap.parentId, index: found.index } }, line);
  }, [openInsert]);

  const closeInsert = useCallback((): void => {
    latest.current.insertMenu?.returnFocus?.focus({ preventScroll: true });
    setInsertMenu(null);
  }, []);

  const insert = useCallback((item: InsertItem, place?: InsertPlace): void => {
    setInsertMenu(null);
    const where = place ?? { after: primaryOf(latest.current.selection) };
    settle(insertCatalogueBlock(session, item.type, where));
  }, [session, settle]);

  return {
    ...labels,
    naming,
    selection, focusRequest, select, settle, drawn, said, announce,
    insertMenu, openInsert, openInsertAtGap, closeInsert, insert,
    washId, clearWash: () => setWashId(null),
    // The toast's Undo undoes the delete only while nothing came after it.
    toast: toast && toast.after === snapshot.template ? toast : null,
    dismissToast: () => setToast(null),
    hinted,
  };
}
