import type { App } from 'obsidian';
import { namesFitting, type ReferenceName } from '../../values/referenceNames';
import { CaretSuggest } from './CaretSuggest';
import { referenceQueryBefore, referenceReplacement } from './referenceQuery';
import { fieldSelection, replaceInField } from './textFields';

/**
 * `@` in a statblock's value: the names its references can be written with (`str`, `str.mod`, `hp`),
 * each with the number it reads now, narrowed as the name is typed. Picking one writes the name
 * after the `@`.
 */
export class ReferenceSuggest extends CaretSuggest<ReferenceName> {
  constructor(app: App, field: HTMLElement, private readonly names: () => readonly ReferenceName[]) {
    super(app, field);
  }

  protected getSuggestions(before: string): ReferenceName[] {
    const query = referenceQueryBefore(before);
    return query ? namesFitting(this.names(), query.typed) : [];
  }

  renderSuggestion(reference: ReferenceName, el: HTMLElement): void {
    el.addClass('mod-complex', 'atlas-sb-reference-option');
    el.createDiv({ cls: 'suggestion-content' }).createDiv({ cls: 'suggestion-title', text: reference.name });
    el.createDiv({ cls: 'suggestion-aux' }).createSpan({ cls: 'atlas-sb-reference-option__value', text: reference.value });
  }

  override selectSuggestion(reference: ReferenceName, event: MouseEvent | KeyboardEvent): void {
    const now = fieldSelection(this.field);
    const query = now ? referenceQueryBefore(now.text.slice(0, now.start)) : null;
    if (now && query) {
      const { from, to, caret } = referenceReplacement(now.text, query, now.start, reference.name);
      replaceInField(this.field, from, to, reference.name, [caret, caret]);
    }
    this.close();
    super.selectSuggestion(reference, event);
  }
}
