import type { Plugin } from 'obsidian';
import { releaseTemplateSessions } from '../statblocks/library/sessionRegistry';
import { NoteFieldWriter } from '../statblocks/notes/NoteFieldWriter';
import { NoteSource } from '../statblocks/notes/noteSource';
import { runInBackground } from '../utils/backgroundTask';

/**
 * Statblock edits are never lost on the way out (§8.5): Obsidian awaits the workspace's `quit`
 * tasks before it quits, a closing popout takes its editors with it, and unloading the plugin
 * starts the last flush (Obsidian does not await an unload). Templates are written only when
 * the template editor saves; unloading drops the drafts no editor saved.
 */
export function registerNoteWriterFlush(plugin: Plugin): void {
  const { app } = plugin;
  plugin.registerEvent(app.workspace.on('quit', (tasks) => {
    tasks.add(() => NoteFieldWriter.forApp(app).flushAll());
  }));
  plugin.registerEvent(app.workspace.on('window-close', () => {
    runInBackground(NoteFieldWriter.forApp(app).flushAll(), 'Saving statblock edits');
  }));
  plugin.register(() => {
    NoteFieldWriter.release(app);
    NoteSource.release(app);
    releaseTemplateSessions(app);
  });
}
