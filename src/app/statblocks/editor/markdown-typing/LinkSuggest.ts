import type { App } from 'obsidian';
import { CaretSuggest } from './CaretSuggest';
import { fieldSelection, replaceInField } from './textFields';
import { linkQueryBefore, linkReplacement, wikilink } from './linkQuery';
import { linkSuggestions, type LinkSuggestion } from './linkSuggestions';

/** `[[` in a statblock's text field: the vault's notes, their aliases and, after `#`, their headings, as Obsidian offers them in a note. */
export class LinkSuggest extends CaretSuggest<LinkSuggestion> {
  constructor(app: App, field: HTMLElement, private readonly sourcePath: () => string) {
    super(app, field);
  }

  protected getSuggestions(before: string): LinkSuggestion[] {
    const query = linkQueryBefore(before);
    return query ? linkSuggestions(this.app, query, this.sourcePath()) : [];
  }

  renderSuggestion(suggestion: LinkSuggestion, el: HTMLElement): void {
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: suggestion.title });
    if (suggestion.note) content.createDiv({ cls: 'suggestion-note', text: suggestion.note });
  }

  override selectSuggestion(suggestion: LinkSuggestion, event: MouseEvent | KeyboardEvent): void {
    const now = fieldSelection(this.field);
    const query = now ? linkQueryBefore(now.text.slice(0, now.start)) : null;
    if (now && query) {
      const link = wikilink(suggestion.link);
      const { from, to, caret } = linkReplacement(now.text, query, now.start, link);
      replaceInField(this.field, from, to, link, [caret, caret]);
    }
    this.close();
    super.selectSuggestion(suggestion, event);
  }
}
