import { FuzzySuggestModal, setIcon, type App, type FuzzyMatch } from 'obsidian';

export interface FolderChoice<T> {
  label: string;
  note?: string;
  value: T;
}

class SoundFolderPicker<T> extends FuzzySuggestModal<FolderChoice<T>> {
  constructor(app: App, private readonly choices: readonly FolderChoice<T>[], placeholder: string, private readonly onChoose: (value: T) => void) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): FolderChoice<T>[] {
    return [...this.choices];
  }

  getItemText(choice: FolderChoice<T>): string {
    return choice.label;
  }

  renderSuggestion(match: FuzzyMatch<FolderChoice<T>>, el: HTMLElement): void {
    el.addClass('mod-complex', 'atlas-link-choice');
    setIcon(el.createDiv({ cls: 'atlas-link-choice__icon' }), 'folder');
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: match.item.label });
    if (match.item.note !== undefined) content.createDiv({ cls: 'suggestion-note', text: match.item.note });
  }

  onChooseItem(choice: FolderChoice<T>): void {
    this.onChoose(choice.value);
  }
}

/** Lets the GM pick a folder from a list: to link where the system's dialog is missing, or to move rows to. */
export function pickFolder<T>(app: App, choices: readonly FolderChoice<T>[], placeholder: string, onChoose: (value: T) => void): void {
  new SoundFolderPicker(app, choices, placeholder, onChoose).open();
}
