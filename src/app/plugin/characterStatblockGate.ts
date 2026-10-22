import type { App, EventRef } from 'obsidian';
import { libraryTokenOf } from '../characters/playerCharacters';
import type { StatblockGate } from '../online/gm/book/statblockGate.ts';
import { AssetService } from '../services/AssetService';
import { TemplateLibrary } from '../statblocks/library/TemplateLibrary';
import { chosenPanelWidth, shownPanelWidth } from '../statblocks/editor/note-panel/panelWidthNow';
import { NoteFieldWriter } from '../statblocks/notes/NoteFieldWriter';
import { templateDiceSet } from '../statblocks/resolve/templateDiceSet';
import { readStatblock } from '../statblocks/resolve/readStatblock';

/** How long a measured panel width counts. */
const PANEL_WIDTH_MS = 1000;

/**
 * The players' characters' statblocks as Atlas holds them: a placed token's library token is found
 * as everywhere (`libraryTokenOf`), a note is read through Atlas's resolver with the app's template
 * library, and an edit is written through the one note writer, so it lands in an open editor as one
 * undo step of the note and never of the map. A note may read otherwise when its properties change,
 * it moves or goes, and every note may when the template library changes. The panel's width is
 * measured at most once a second: the books ask for it on every poll. While no note shows (the GM
 * is on the map), it is the width last measured beside one, so moving between the map and a note
 * changes nothing for the players.
 */
export function characterStatblockGate(app: App): StatblockGate {
  let measured: { at: number; width: number } | null = null;
  let besideNote: number | null = null;
  return {
    panelWidth: () => {
      const now = Date.now();
      if (measured === null || now - measured.at >= PANEL_WIDTH_MS) {
        besideNote = shownPanelWidth(app) ?? besideNote;
        measured = { at: now, width: besideNote ?? chosenPanelWidth(app) };
      }
      return measured.width;
    },
    libraryStatblock: (placed) => libraryTokenOf(placed, AssetService.getInstance(app).loadedTokenAssets())?.statblockPath ?? null,
    diceSet: (path) => templateDiceSet(app, path),
    read: (path) => readStatblock(app, path),
    write: async (path, patches) => {
      const { applied, conflicts, problem } = await NoteFieldWriter.forApp(app).write(path, patches);
      return { applied, conflicts, problem };
    },
    onChange: (listener) => {
      const noteRef = app.metadataCache.on('changed', (file) => listener(file.path));
      const refs: EventRef[] = [
        app.vault.on('delete', (file) => listener(file.path)),
        app.vault.on('rename', (file, oldPath) => {
          listener(oldPath);
          listener(file.path);
        }),
      ];
      const stopTemplates = TemplateLibrary.forApp(app).subscribe(() => listener(null));
      return () => {
        app.metadataCache.offref(noteRef);
        for (const ref of refs) app.vault.offref(ref);
        stopTemplates();
      };
    },
  };
}
