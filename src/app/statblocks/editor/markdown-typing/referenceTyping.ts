import type { App } from 'obsidian';
import type { ReferenceName } from '../../values/referenceNames';
import { watchFieldSuggests } from './fieldSuggests';
import { ReferenceSuggest } from './ReferenceSuggest';
import { typedField } from './textFields';

/** The field `target` is where `@` offers references: any field typed into, numbers and dice too, without a list of its own (a choice's dropdown). */
export function referenceField(target: EventTarget | null): HTMLElement | null {
  const field = typedField(target);
  return field && field.getAttribute('role') !== 'combobox' ? field : null;
}

/**
 * `@` suggestions for every text field of the statblock panel `host`: each field gets its suggest
 * the first time it takes focus, offering `names()` as they are when the list opens. Returns the
 * stop, which closes a list still open.
 */
export function watchReferenceTyping(app: App, host: HTMLElement, names: () => readonly ReferenceName[]): () => void {
  return watchFieldSuggests(host, referenceField, (field) => new ReferenceSuggest(app, field, names));
}
