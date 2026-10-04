import { AbstractInputSuggest, TFile, type App } from 'obsidian';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif']);
const MAX_SUGGESTIONS = 50;

/** Suggests vault images by path while the user types in a text field. */
export class ImagePathSuggest extends AbstractInputSuggest<TFile> {
  constructor(app: App, input: HTMLInputElement, private readonly onPick: (path: string) => void) {
    super(app, input);
  }

  protected getSuggestions(query: string): TFile[] {
    const needle = query.toLowerCase();
    return this.app.vault.getFiles()
      .filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()) && file.path.toLowerCase().includes(needle))
      .slice(0, MAX_SUGGESTIONS);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.onPick(file.path);
    this.close();
  }
}
