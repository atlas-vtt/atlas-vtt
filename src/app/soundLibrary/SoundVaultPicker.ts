import { FuzzySuggestModal, setIcon, type App, type FuzzyMatch, type TFile } from 'obsidian';
import { t } from '../i18n';
import type { AssetService } from '../services/AssetService';
import { showNotice } from '../ui/notice';
import { parentPath } from '../utils/pathUtils';
import { runVaultSoundImport } from './runSoundImport';
import { unrecordedAudio } from './soundImport';

interface SoundChoice {
  label: string;
  /** A folder's files, or the one file. */
  files: TFile[];
  isFolder: boolean;
}

/** One choice per file, and before them one per folder that holds several, so a whole library takes one press. */
function choicesOf(files: readonly TFile[]): SoundChoice[] {
  const byFolder = new Map<string, TFile[]>();
  for (const file of files) {
    for (let folder = parentPath(file.path); folder !== ''; folder = parentPath(folder)) {
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
    }
  }
  const folders = [...byFolder].filter(([, held]) => held.length > 1).map(([path, held]): SoundChoice => ({ label: path, files: held, isFolder: true }));
  return [...folders, ...files.map((file): SoundChoice => ({ label: file.path, files: [file], isFolder: false }))];
}

class SoundVaultPicker extends FuzzySuggestModal<SoundChoice> {
  constructor(app: App, private readonly choices: SoundChoice[], private readonly onChoose: (files: TFile[]) => void) {
    super(app);
    this.setPlaceholder(t('audio.pickPlaceholder'));
  }

  getItems(): SoundChoice[] {
    return this.choices;
  }

  getItemText(choice: SoundChoice): string {
    return choice.label;
  }

  renderSuggestion(match: FuzzyMatch<SoundChoice>, el: HTMLElement): void {
    const choice = match.item;
    el.addClass('mod-complex', 'atlas-link-choice');
    setIcon(el.createDiv({ cls: 'atlas-link-choice__icon' }), choice.isFolder ? 'folder' : 'music');
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: choice.label });
    if (choice.isFolder) content.createDiv({ cls: 'suggestion-note', text: t('audio.pickFolder', { count: choice.files.length }) });
  }

  onChooseItem(choice: SoundChoice): void {
    this.onChoose(choice.files);
  }
}

/** Lets the GM pick audio already in the vault, a file or a folder, to record as sounds of a collection. */
export async function pickVaultSounds(app: App, assetService: AssetService, collectionId: string): Promise<void> {
  const files = await unrecordedAudio(app, assetService, collectionId);
  if (files.length === 0) {
    showNotice(t('audio.pickNone'));
    return;
  }
  new SoundVaultPicker(app, choicesOf(files), (chosen) => { void runVaultSoundImport(app, assetService, chosen, collectionId); }).open();
}
