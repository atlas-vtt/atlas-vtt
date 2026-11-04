import type { App } from 'obsidian';
import { watchFieldSuggests } from './fieldSuggests';
import { LinkSuggest } from './LinkSuggest';
import { markdownField } from './textFields';

/** The field `target` is where `[[` offers links: a Markdown field without a list of its own (a choice's dropdown). */
export function linkField(target: EventTarget | null): HTMLElement | null {
  const field = markdownField(target);
  return field && field.getAttribute('role') !== 'combobox' ? field : null;
}

/**
 * Link suggestions for every text field of the statblock panel `host`, as
 * Obsidian offers them in a note: each field gets its suggest the first time
 * it takes focus. The formatting keys are the panel's key scope's
 * (`panelScope.ts`). Returns the stop, which closes a list still open.
 */
export function watchMarkdownTyping(app: App, host: HTMLElement, sourcePath: () => string): () => void {
  return watchFieldSuggests(host, linkField, (field) => new LinkSuggest(app, field, sourcePath));
}
