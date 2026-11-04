import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import type { App } from 'obsidian';
import { observeResize } from '../../../../utils/observeResize';
import { readableLineOf } from '../../note-panel/noteRoom';
import { panelPrefsSource } from '../../note-panel/panelPrefsSource';
import { STACK_BELOW, loadPanelPrefs, panelWidth, savePanelPrefs, type NoteRoom, type PanelPrefs } from '../../note-panel/panelPrefs';
import { editorWidthOf, type EditorWidth } from './editorWidth';

const NO_PREFS: PanelPrefs = { width: null };

/** The room the template editor's row gives its note and its panel, measured as a note view measures its own. */
export interface PanelRoom {
  /** The panel's width in CSS pixels. */
  width: number;
  /** Too narrow for two columns: the card stands above the note. */
  stacked: boolean;
  /** How the floating panels behave at this width. */
  editorWidth: EditorWidth;
  /** What the note column keeps beside the panel. */
  noteColumn: number;
  availableWidth: () => number;
  onResize: (width: number, done: boolean) => void;
  onCancelResize: () => void;
  onResetWidth: () => void;
}

function storedPrefs(app: App | undefined): PanelPrefs {
  if (!app) return NO_PREFS;
  return panelPrefsSource(app)?.panelPrefs() ?? loadPanelPrefs(app);
}

/**
 * The statblock panel's width in the template editor (§2.1): the width the
 * user chose for the panel beside their notes, else the default a note view
 * of this size and readable line would give, so the card has the same
 * columns as in their notes. Its edge sets that same width.
 */
export function usePanelRoom(app: App | undefined, rowRef: RefObject<HTMLElement | null>, previewRef: RefObject<HTMLElement | null>): PanelRoom {
  const [room, setRoom] = useState<NoteRoom>({ available: 0, readableLine: null });
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [, setRevision] = useState(0);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const measure = (): void => {
      const next = { available: row.clientWidth, readableLine: readableLineOf(previewRef.current) };
      setRoom((was) => (was.available === next.available && was.readableLine === next.readableLine ? was : next));
    };
    measure();
    return observeResize([row], measure);
  }, [rowRef, previewRef]);

  // A width chosen beside a note (or reset there) reaches this panel too.
  useEffect(() => {
    if (!app) return undefined;
    return panelPrefsSource(app)?.onPrefsChange(() => setRevision((count) => count + 1));
  }, [app]);

  const store = useCallback((width: number | null): void => {
    if (!app) return;
    const panels = panelPrefsSource(app);
    if (panels) {
      if (width === null) panels.resetPanelWidth();
      else panels.setPanelWidth(width, true);
    } else {
      savePanelPrefs(app, { ...loadPanelPrefs(app), width });
    }
    setRevision((count) => count + 1);
  }, [app]);

  const width = dragWidth ?? panelWidth(storedPrefs(app), room);
  const stacked = room.available > 0 && room.available < STACK_BELOW;
  return {
    width,
    stacked,
    editorWidth: editorWidthOf(room.available),
    noteColumn: stacked ? room.available : Math.max(0, room.available - width),
    availableWidth: () => rowRef.current?.clientWidth ?? room.available,
    onResize: (next, done) => {
      if (!done) {
        setDragWidth(next);
        return;
      }
      setDragWidth(null);
      store(next);
    },
    onCancelResize: () => setDragWidth(null),
    onResetWidth: () => store(null),
  };
}
