import type { MarkdownViewModeType } from 'obsidian';
import { isRecord } from '../utils/guards';

/**
 * Pinned note previews, saved per map so they reopen where the user left them
 * whenever the map loads again (scene switch, reopened map, restart).
 */

/** Position and size of a preview window in CSS pixels. */
export interface PreviewWindowLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * How the note inside a preview was left: reading or editing mode plus
 * Obsidian's ephemeral view state (cursor, selection and scroll).
 */
export interface NoteViewState {
  mode?: MarkdownViewModeType;
  eState: Record<string, unknown>;
}

/** A pinned preview as saved in the map file. */
export interface PinnedNotePreview extends PreviewWindowLayout {
  /** The pin or token the preview was opened from. */
  anchorId: string;
  /** The linked note, including its `#heading` when the link has one. */
  notePath: string;
  /** Absent until the note has loaded, and for files that are not shown in a leaf. */
  view?: NoteViewState;
}

export interface PinnedNotePreviewSlice {
  /** Keyed by anchor id: a pin or token has at most one preview. */
  pinnedNotePreviews: Record<string, PinnedNotePreview>;
  savePinnedNotePreview: (preview: PinnedNotePreview) => void;
  removePinnedNotePreview: (anchorId: string) => void;
}

type ImmerSet = (fn: (draft: Pick<PinnedNotePreviewSlice, 'pinnedNotePreviews'>) => void) => void;

export function createPinnedNotePreviewActions(
  set: ImmerSet,
): Pick<PinnedNotePreviewSlice, 'savePinnedNotePreview' | 'removePinnedNotePreview'> {
  return {
    savePinnedNotePreview: (preview) => set((draft) => {
      draft.pinnedNotePreviews[preview.anchorId] = preview;
    }),
    removePinnedNotePreview: (anchorId) => set((draft) => {
      delete draft.pinnedNotePreviews[anchorId];
    }),
  };
}

function isNoteViewState(value: unknown): value is NoteViewState {
  if (!isRecord(value)) return false;
  return (value.mode === undefined || value.mode === 'source' || value.mode === 'preview') && isRecord(value.eState);
}

function isPinnedNotePreview(value: unknown): value is PinnedNotePreview {
  if (!isRecord(value)) return false;
  const { anchorId, notePath, left, top, width, height, view } = value;
  return typeof anchorId === 'string'
    && typeof notePath === 'string'
    && [left, top, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))
    && (view === undefined || isNoteViewState(view));
}

/** The valid entries of a map's saved previews; the field comes from the map file unchecked. */
export function readPinnedNotePreviews(value: unknown): PinnedNotePreview[] {
  if (!isRecord(value)) return [];
  return Object.values(value).filter(isPinnedNotePreview);
}
