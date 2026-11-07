/**
 * The template editor's keys (§7.7). One handler serves the view's Obsidian
 * scope (asked before any listener, so Mod+G is ours and not the graph's) and
 * the editor's own keydown listener (tests, a window without the scope). It
 * answers whether it used the key; a focused text input keeps every key,
 * its own undo included, and so does a control that used the key first. The
 * template's note (Obsidian's own editor) keeps every key, Mod+S included.
 */

import { useCallback, useRef } from 'react';
import { Platform } from 'obsidian';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { DRAGGING_ATTRIBUTE } from '../dnd/dndConfig';
import { clipOf, copyBlocks, rememberClip } from './blockClipboard';
import { deleteSelection, duplicateSelection, pasteClip, toggleHeaderPartHidden } from './blockActions';
import { moveSelection } from './blockMoves';
import { LIVE_TABLE_ATTRIBUTE } from '../table/EditableTable';
import { HOSTED_NOTE_ATTRIBUTE } from './shell/TemplateBodyColumn';
import { BLOCK_KEYS_SELECTOR } from './Canvas';
import { keyCommand, scopeOf, type KeyCommand } from './keyCommands';
import { tabStopBeside, typesText } from './regions';
import { primaryOf, stepInReadingOrder, type BlockSelection } from './selection';
import { refusalMessage, type EditOutcome } from './sessionEdit';
import type { EditorSession } from './sessionTypes';
import { t } from '../../../i18n';

export interface KeyboardTarget {
  /** The editor's root element; keys count only while focus is inside it. */
  rootRef: { readonly current: HTMLElement | null };
  session: EditorSession;
  selection: BlockSelection;
  /** Whether the canvas draws the block (one hidden by its condition is skipped). */
  drawn: (id: string) => boolean;
  /** Selects and moves focus to the primary block. */
  select: (selection: BlockSelection) => void;
  /** Takes an edit's outcome: its selection, its announcement, a delete's toast. */
  settle: (outcome: EditOutcome, focusPrimary?: boolean) => void;
  editLabel: (id: string) => void;
  openInsert: () => void;
  openMenu: () => void;
  /** Mod+S: the save dialog. */
  openSave: () => void;
  /** Who shares the copied blocks: the app, so every view of it pastes them. */
  clipOwner: object;
}

/** `fromScope`: the view's Obsidian key scope asks, not a listener in the editor. */
export type KeyHandler = (event: KeyboardEvent, fromScope?: boolean) => boolean;

/** A blank template's first ghost row, which Tab reaches from the card's header before it leaves the card. */
const BLANK_ROW = 'button.atlas-te-blank__row:not([disabled])';

function tab(target: KeyboardTarget, active: HTMLElement, step: 1 | -1): boolean {
  const stage = active.closest<HTMLElement>(BLOCK_KEYS_SELECTOR);
  const region = stage?.closest<HTMLElement>('[data-te-region]') ?? stage;
  if (!stage || !region) return false;
  const blank = step === 1 ? stage.querySelector<HTMLElement>(BLANK_ROW) : null;
  const next = blank ?? tabStopBeside(region, stage, step);
  next?.focus();
  return next !== null;
}

function escape(target: KeyboardTarget, event: KeyboardEvent): boolean {
  if (handledByAnotherControl(event)) return false;
  if (primaryOf(target.selection) === null) return false;
  target.select([]);
  return true;
}

/** Runs a command on the selection: a key's, or the block toolbar's button of the same name. True when it was one. */
export function runBlockCommand(target: KeyboardTarget, command: KeyCommand): boolean {
  const { session, selection, drawn } = target;
  const snapshot = session.getSnapshot();
  const primary = primaryOf(selection);
  const go = (id: string | null): true => {
    if (id !== null) target.select([id]);
    return true;
  };
  switch (command) {
    case 'select-previous': return go(stepInReadingOrder(snapshot.template, primary, -1, drawn));
    case 'select-next': return go(stepInReadingOrder(snapshot.template, primary, 1, drawn));
    case 'insert': target.openInsert(); return true;
    case 'paste': {
      const clip = clipOf(target.clipOwner);
      if (clip) target.settle(pasteClip(session, clip, primary));
      return true;
    }
    default: break;
  }
  if (primary === null) return false;
  switch (command) {
    case 'move-up': target.settle(moveSelection(session, selection, -1), true); return true;
    case 'move-down': target.settle(moveSelection(session, selection, 1), true); return true;
    case 'edit-label': target.editLabel(primary); return true;
    case 'duplicate': target.settle(duplicateSelection(session, selection)); return true;
    case 'delete': target.settle(deleteSelection(session, selection)); return true;
    case 'toggle-hidden': target.settle(toggleHeaderPartHidden(session, primary)); return true;
    case 'copy': {
      const clip = copyBlocks(snapshot.template, selection);
      if (clip) rememberClip(target.clipOwner, clip);
      if (!clip) target.settle({ announce: refusalMessage('header') ?? undefined });
      else target.settle({ announce: clip.blocks.length > 1 ? t('templateEditor.copiedBlocks', { count: clip.blocks.length }) : t('templateEditor.copied') });
      return true;
    }
    case 'open-menu': target.openMenu(); return true;
    default: return false;
  }
}

function history(target: KeyboardTarget, command: 'undo' | 'redo'): true {
  const { session } = target;
  const snapshot = session.getSnapshot();
  const possible = command === 'undo' ? snapshot.canUndo : snapshot.canRedo;
  if (command === 'undo') session.undo();
  else session.redo();
  target.settle({ announce: possible ? (command === 'undo' ? t('templateEditor.undid') : t('templateEditor.redid')) : (command === 'undo' ? t('templateEditor.nothingToUndo') : t('templateEditor.nothingToRedo')) });
  return true;
}

/**
 * Whether the press was the editor's: the caller then prevents its default.
 * `fromScope`: asked by the view's key scope, which Obsidian consults only
 * while the view's tab is active, so undo and redo count even where focus
 * left the editor's elements (a click on its background).
 */
export function handleTemplateKey(target: KeyboardTarget, event: KeyboardEvent, mac: boolean, fromScope = false): boolean {
  const root = target.rootRef.current;
  const active = root?.doc.activeElement ?? null;
  // A held block's keys are the drag's: Escape cancels it (dnd-kit listens on the document), and no command moves what it holds.
  if (!root || root.hasAttribute(DRAGGING_ATTRIBUTE)) return false;
  const command = keyCommand(event, mac);
  if (command === null || active?.closest(`[${HOSTED_NOTE_ATTRIBUTE}]`)) return false;
  const inside = active?.instanceOf(HTMLElement) === true && root.contains(active);
  // Mod+S saves from a field being typed in too; every other key there is the field's.
  if (command === 'save') {
    if (!inside && !fromScope) return false;
    target.openSave();
    return true;
  }
  if (typesText(active)) return false;
  if (scopeOf(command) === 'view') return inside || fromScope ? history(target, command === 'undo' ? 'undo' : 'redo') : false;
  // A Table's selected row or column takes its own keys (Delete deletes the row, not the tile).
  if (active?.closest(`[${LIVE_TABLE_ATTRIBUTE}]`)) return false;
  if (!inside || !active?.instanceOf(HTMLElement) || !active.closest(BLOCK_KEYS_SELECTOR)) return false;
  // Chrome's own controls (the ghost card's rows) keep their keys, Tab included; "/" still inserts.
  if (active.closest('.atlas-te-chrome-control')) return command === 'insert' && runBlockCommand(target, command);
  if (command === 'next-region' || command === 'previous-region') return tab(target, active, command === 'next-region' ? 1 : -1);
  if (command === 'escape') return escape(target, event);
  return runBlockCommand(target, command);
}

/** A stable handler that always acts on the editor's latest state. */
export function useTemplateKeyboard(target: KeyboardTarget): KeyHandler {
  const latest = useRef(target);
  latest.current = target;
  return useCallback((event: KeyboardEvent, fromScope?: boolean) => handleTemplateKey(latest.current, event, Platform.isMacOS, fromScope), []);
}
