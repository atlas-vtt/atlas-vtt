/**
 * The template's note in the template editor's left column: which file it
 * is, and that file shown in Obsidian's own editor (a real `MarkdownView` in
 * a leaf of its own, out of the workspace), so links, suggestions, slash
 * commands, Live Preview and other plugins work as in any note.
 */

import { useEffect, useState, type RefObject } from 'react';
import { MarkdownView, type App, type OpenViewState, type TFile, type WorkspaceLeaf } from 'obsidian';
import { closeDetachedNoteLeaf, openDetachedNoteLeaf } from '../../../../services/detachedNoteLeaf';
import { noteOpenBody } from '../../../library/templateBodyNotes';
import { templateBodyPath } from '../../../library/templatePaths';
import type { TemplateId } from '../../../model/templateTypes';

/** Classes of the hosted view: Atlas' embedded-leaf look (fills its host, no view header, Obsidian's tooltips) and the column's own. */
const VIEW_CLASSES = ['atlas-embedded-leaf-view', 'atlas-embedded-leaf-view--fill-editor', 'atlas-te-note__view'];
/** Always the editor: the column has no header to switch to Reading view with. Live Preview or Source stays the user's choice. */
const EDITING: OpenViewState = { active: false, state: { mode: 'source' } };

function lookup(app: App | undefined, path: string | null): TFile | null {
  return app && path !== null ? app.vault.getFileByPath(path) : null;
}

interface HeldNote {
  id: TemplateId;
  file: TFile | null;
}

/**
 * The note beside the template at `templatePath`, followed through the
 * vault's events; null for a template without a file or a note. While the
 * template is renamed, its note keeps showing until it has followed.
 */
export function useTemplateBodyFile(app: App | undefined, id: TemplateId, templatePath: string | null): TFile | null {
  const bodyPath = templatePath === null ? null : templateBodyPath(templatePath);
  const [held, setHeld] = useState<HeldNote>(() => ({ id, file: lookup(app, bodyPath) }));

  useEffect(() => {
    if (!app) return undefined;
    const resolve = (): void => setHeld((was) => {
      const kept = was.id === id ? was.file : null;
      const found = lookup(app, bodyPath);
      if (found) return kept?.path === found.path ? was : { id, file: found };
      // Renamed with its template: the note follows a moment later.
      if (kept && app.vault.getFileByPath(kept.path)) return was;
      return kept === null && was.id === id ? was : { id, file: null };
    });
    resolve();
    const refs = [app.vault.on('create', resolve), app.vault.on('delete', resolve), app.vault.on('rename', resolve)];
    return () => {
      for (const ref of refs) app.vault.offref(ref);
    };
  }, [app, id, bodyPath]);

  return held.id === id ? held.file : lookup(app, bodyPath);
}

/**
 * Shows `file` in Obsidian's editor inside `host` for as long as it is the
 * file: another file, an unmount (the editor closing, another template, Atlas
 * unloading) closes the leaf again. `focus` set: the editor takes focus once
 * shown, and the request is used up.
 */
export function useHostedNote(
  app: App | undefined, file: TFile | null, host: RefObject<HTMLElement | null>, focus: RefObject<boolean>,
): void {
  useEffect(() => {
    const parent = host.current;
    if (!app || !file || !parent) return undefined;
    let leaf: WorkspaceLeaf | null = null;
    let stopReading: (() => void) | null = null;
    let closed = false;
    // Obsidian saves the notes of its own leaves before it quits; this leaf is none of them.
    const quitting = app.workspace.on('quit', (tasks) => {
      const view = leaf?.view;
      if (view instanceof MarkdownView) tasks.add(() => view.save());
    });
    const shown = (opened: WorkspaceLeaf | null): void => {
      const view = opened?.view;
      if (closed || !opened || !(view instanceof MarkdownView)) {
        if (opened) closeDetachedNoteLeaf(opened);
        return;
      }
      leaf = opened;
      view.containerEl.addClass(...VIEW_CLASSES);
      parent.appendChild(view.containerEl);
      // Obsidian saves a note a moment after typing pauses; a statblock made meanwhile reads the editor.
      const { editor } = view;
      stopReading = noteOpenBody(app, file, {
        read: () => view.getViewData(),
        replace: (text) => {
          const last = editor.lastLine();
          editor.replaceRange(text, { line: 0, ch: 0 }, { line: last, ch: editor.getLine(last).length });
        },
      });
      if (focus.current) {
        focus.current = false;
        view.editor.focus();
      }
    };
    openDetachedNoteLeaf(app, file, { openState: EDITING }).then(shown, (error: unknown) => {
      console.error('[Atlas] Could not show the template\'s note:', error);
    });
    return () => {
      closed = true;
      app.workspace.offref(quitting);
      stopReading?.();
      if (leaf) closeDetachedNoteLeaf(leaf);
      leaf = null;
    };
  }, [app, file, host, focus]);
}
