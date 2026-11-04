import {
  EditorSuggest,
  prepareFuzzySearch,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type Plugin,
  type TFile,
} from 'obsidian';
import { EXTENSION_ATLASMAP } from '../utils/sceneFiles';
import { snapshotsOfMap } from './atlasLinkAssets';
import { linkSafeName } from './atlasLinkTargets';
import { getLocale, t } from '../i18n';

interface SnapshotSuggestion {
  name: string;
  savedAt: number;
  thumbnailUrl: string | null;
}

/** `[[Tavern.atlasmap#Bef` before the cursor: the link's path and what is typed after its `#`. */
const SUBPATH_LINK = /\[\[([^\]#|]+)#([^\]#|^]*)$/;

/** Where the link that holds the cursor starts, the path it names and the scene file it resolves to. */
interface SnapshotLinkContext {
  linkStart: number;
  linkPath: string;
  map: TFile;
}

/**
 * Lists a scene's snapshots after the `#` of a link to its `.atlasmap`
 * (`[[Tavern.atlasmap#`), as Obsidian lists a note's headings, and completes
 * the link with the chosen snapshot's name.
 */
export class SnapshotLinkSuggest extends EditorSuggest<SnapshotSuggestion> {
  private link: SnapshotLinkContext | null = null;

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    const beforeCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const match = SUBPATH_LINK.exec(beforeCursor);
    const linkPath = match?.[1];
    const query = match?.[2] ?? '';
    const map = linkPath ? this.app.metadataCache.getFirstLinkpathDest(linkPath, file?.path ?? '') : null;
    if (!match || !linkPath || map?.extension !== EXTENSION_ATLASMAP) {
      this.link = null;
      return null;
    }
    this.link = { linkStart: match.index, linkPath, map };
    return {
      start: { line: cursor.line, ch: cursor.ch - query.length },
      end: cursor,
      query,
    };
  }

  async getSuggestions(context: EditorSuggestContext): Promise<SnapshotSuggestion[]> {
    const map = this.link?.map;
    if (!map) return [];
    const { service, entries } = await snapshotsOfMap(this.app, map.path);
    const matches = prepareFuzzySearch(context.query.trim());
    return entries
      .filter((entry) => !context.query.trim() || matches(entry.snapshot.name))
      .map((entry) => ({
        name: entry.snapshot.name,
        savedAt: entry.snapshot.updatedAt ?? entry.snapshot.createdAt,
        thumbnailUrl: service.thumbnailUrl(entry),
      }));
  }

  renderSuggestion(suggestion: SnapshotSuggestion, el: HTMLElement): void {
    el.addClass('mod-complex', 'atlas-snapshot-suggestion');
    if (suggestion.thumbnailUrl) {
      el.createEl('img', { cls: 'atlas-snapshot-suggestion__thumbnail', attr: { src: suggestion.thumbnailUrl, alt: '', decoding: 'async' } });
    }
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: suggestion.name });
    const date = new Date(suggestion.savedAt).toLocaleDateString(getLocale(), { dateStyle: 'medium' });
    content.createDiv({ cls: 'suggestion-note', text: t('snapshots.savedAt', { date }) });
  }

  selectSuggestion(suggestion: SnapshotSuggestion): void {
    const { context, link } = this;
    if (!context || !link) return;
    const { editor, end } = context;
    const line = editor.getLine(end.line);
    const closes = line.slice(end.ch).startsWith(']]');
    const text = `[[${link.linkPath}#${linkSafeName(suggestion.name)}]]`;
    const from = { line: end.line, ch: link.linkStart };
    editor.replaceRange(text, from, closes ? { line: end.line, ch: end.ch + 2 } : end);
    editor.setCursor({ line: end.line, ch: link.linkStart + text.length });
  }
}

/**
 * Registers the suggester ahead of Obsidian's own: the first suggester that
 * triggers wins, and Obsidian's link suggester answers every `[[file#` with
 * the file's headings, which a scene has none of. Only scene links reach it.
 */
export function registerSnapshotLinkSuggest(plugin: Plugin): void {
  const suggest = new SnapshotLinkSuggest(plugin.app);
  plugin.registerEditorSuggest(suggest);
  const suggests = plugin.app.workspace.editorSuggest?.suggests;
  if (!Array.isArray(suggests)) return;
  const index = suggests.indexOf(suggest);
  if (index > 0) {
    suggests.splice(index, 1);
    suggests.unshift(suggest);
  }
}
