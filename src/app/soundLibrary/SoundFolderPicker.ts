import { FuzzySuggestModal, setIcon, type App, type FuzzyMatch } from 'obsidian';

export interface FolderChoice {
  label: string;
  path: string;
}

class SoundFolderPicker extends FuzzySuggestModal<FolderChoice> {
  constructor(app: App, private readonly choices: readonly FolderChoice[], placeholder: string, private readonly onChoose: (path: string) => void) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): FolderChoice[] {
    return [...this.choices];
  }

  getItemText(choice: FolderChoice): string {
    return choice.label;
  }

  renderSuggestion(match: FuzzyMatch<FolderChoice>, el: HTMLElement): void {
    el.addClass('mod-complex', 'atlas-link-choice');
    setIcon(el.createDiv({ cls: 'atlas-link-choice__icon' }), 'folder');
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: match.item.label });
  }

  onChooseItem(choice: FolderChoice): void {
    this.onChoose(choice.path);
  }
}

/** Lets the GM pick a folder from a list, to link where the system's dialog is missing. */
export function pickFolder(app: App, choices: readonly FolderChoice[], placeholder: string, onChoose: (path: string) => void): void {
  new SoundFolderPicker(app, choices, placeholder, onChoose).open();
}
