import { FuzzySuggestModal, setIcon, type App, type Editor, type FuzzyMatch, type TFile } from 'obsidian';
import { AssetService } from '../services/AssetService';
import { primaryPath } from '../services/vault-sync/assetFiles';
import { atlasLink } from './atlasLinkText';
import { t } from '../i18n';

interface AtlasLinkChoice {
  name: string;
  kind: 'scene' | 'encounter';
  collection: string;
  file: TFile;
}

const KIND_ICONS: Record<AtlasLinkChoice['kind'], string> = { scene: 'clapperboard', encounter: 'swords' };

/** Every scene and encounter whose file is in the vault, by name. */
async function linkChoices(app: App): Promise<AtlasLinkChoice[]> {
  const assets = await AssetService.getInstance(app).getAssets();
  const choices: AtlasLinkChoice[] = [];
  for (const asset of assets) {
    if (asset.type !== 'scene' && asset.type !== 'encounter') continue;
    const path = primaryPath(asset);
    const file = path ? app.vault.getFileByPath(path) : null;
    if (file) choices.push({ name: asset.name, kind: asset.type, collection: asset.collection, file });
  }
  return choices.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Picks a scene or encounter and inserts a link to it at the cursor. Encounter
 * files are named by id, so Obsidian's own link suggestions cannot find them.
 */
class InsertAtlasLinkModal extends FuzzySuggestModal<AtlasLinkChoice> {
  constructor(app: App, private readonly choices: AtlasLinkChoice[], private readonly editor: Editor, private readonly sourcePath: string) {
    super(app);
    this.setPlaceholder(t('atlasLinks.insertPlaceholder'));
  }

  getItems(): AtlasLinkChoice[] {
    return this.choices;
  }

  getItemText(choice: AtlasLinkChoice): string {
    return choice.name;
  }

  renderSuggestion(match: FuzzyMatch<AtlasLinkChoice>, el: HTMLElement): void {
    const choice = match.item;
    el.addClass('mod-complex', 'atlas-link-choice');
    setIcon(el.createDiv({ cls: 'atlas-link-choice__icon' }), KIND_ICONS[choice.kind]);
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: choice.name });
    const kind = choice.kind === 'scene' ? t('atlasLinks.kindScene') : t('atlasLinks.kindEncounter');
    content.createDiv({ cls: 'suggestion-note', text: `${kind} · ${choice.collection}` });
  }

  onChooseItem(choice: AtlasLinkChoice): void {
    this.editor.replaceSelection(atlasLink(this.app, choice.file, this.sourcePath, { name: choice.name }));
  }
}

/** Opens the picker once the scenes and encounters are read. */
export async function openInsertAtlasLink(app: App, editor: Editor, sourcePath: string): Promise<void> {
  new InsertAtlasLinkModal(app, await linkChoices(app), editor, sourcePath).open();
}
