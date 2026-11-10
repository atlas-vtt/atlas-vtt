import type { App } from 'obsidian';
import { NoteFieldWriter } from '../notes/NoteFieldWriter';
import { NoteSource } from '../notes/noteSource';

/** What the pane reads its note's values from and writes them through: one source and one writer per app. */
export interface PaneServices {
  source: Pick<NoteSource, 'read' | 'watch'>;
  writer: Pick<NoteFieldWriter, 'write' | 'flush' | 'undo' | 'redo' | 'registerPending'>;
}

/** The app's note source and writer. */
export function appPaneServices(app: App): PaneServices {
  return { source: NoteSource.forApp(app), writer: NoteFieldWriter.forApp(app) };
}
