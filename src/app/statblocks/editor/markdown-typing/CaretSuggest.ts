import { AbstractInputSuggest, type App } from 'obsidian';
import { toggleMarkIn } from './markIn';
import { fieldSelection, replaceInField } from './textFields';

/** The list Obsidian's suggestions keep; not in its API, so asked for before it is used. */
interface SuggestChooser {
  useSelectedItem?: (event: KeyboardEvent) => boolean;
}

/**
 * Obsidian's suggestion popover on one of the statblock panel's text fields (its keys, look and
 * placement, in whatever window the field is in), offering what fits the text before the caret, so
 * a suggestion works anywhere in a value. While the list is open its keys are Obsidian's: Escape
 * closes the list and stops there, Enter (and here Tab) takes the highlighted suggestion. Its key
 * scope stands on Obsidian's app scope, not the panel's, so the formatting keys and Mod+Z are
 * registered on it too: the note around the panel must not take them.
 */
export abstract class CaretSuggest<T> extends AbstractInputSuggest<T> {
  constructor(app: App, protected readonly field: HTMLElement) {
    // Obsidian reads only what every element has (focus, size, events); the value is read and written below.
    super(app, field as HTMLDivElement);
    this.scope.register([], 'Tab', (event) => this.chooseHighlighted(event));
    this.scope.register(['Mod'], 'b', () => (toggleMarkIn(field, '**') ? false : undefined));
    this.scope.register(['Mod'], 'i', () => (toggleMarkIn(field, '*') ? false : undefined));
    this.scope.register(['Mod'], 'z', () => true);
    this.scope.register(['Mod', 'Shift'], 'z', () => true);
  }

  /** The text before the caret: all a suggestion being typed needs. */
  override getValue(): string {
    const now = fieldSelection(this.field);
    return now && now.start === now.end ? now.text.slice(0, now.start) : '';
  }

  override setValue(value: string): void {
    const now = fieldSelection(this.field);
    replaceInField(this.field, 0, now?.text.length ?? 0, value, [value.length, value.length]);
  }

  private chooseHighlighted(event: KeyboardEvent): false | undefined {
    const chooser = (this as unknown as { suggestions?: SuggestChooser }).suggestions;
    return chooser?.useSelectedItem?.(event) ? false : undefined;
  }
}
