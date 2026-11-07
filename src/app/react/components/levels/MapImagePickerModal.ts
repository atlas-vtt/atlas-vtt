import { FuzzySuggestModal, setIcon, type App, type FuzzyMatch } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { t } from '../../../i18n';

interface MapImageChoice {
  name: string;
  /** The image's vault path; null for a level without one. */
  path: string | null;
  collection: string | null;
}

/** What the picker is for: a level's map, or its roof. */
export type MapImagePick = 'map' | 'roof';

/** The map images of the library, those of `collection` first, then by name; "no map image" (or "no roof") before them. */
async function mapImageChoices(app: App, collection: string | null, pick: MapImagePick): Promise<MapImageChoice[]> {
  const assets = await AssetService.getInstance(app).getAssets();
  const maps: MapImageChoice[] = [];
  for (const asset of assets) {
    if (asset.type === 'map' && app.vault.getFileByPath(asset.mapFilePath)) maps.push({ name: asset.name, path: asset.mapFilePath, collection: asset.collection });
  }
  maps.sort((a, b) => Number(b.collection === collection) - Number(a.collection === collection) || a.name.localeCompare(b.name));
  return [{ name: t(pick === 'roof' ? 'levels.noRoof' : 'levels.noImage'), path: null, collection: null }, ...maps];
}

/** Picks a map image of the library for a level. */
class MapImagePickerModal extends FuzzySuggestModal<MapImageChoice> {
  constructor(app: App, private readonly choices: MapImageChoice[], private readonly onChoose: (path: string | null) => void, pick: MapImagePick) {
    super(app);
    this.setPlaceholder(t(pick === 'roof' ? 'levels.pickRoof' : 'levels.pickImage'));
  }

  getItems(): MapImageChoice[] {
    return this.choices;
  }

  getItemText(choice: MapImageChoice): string {
    return choice.name;
  }

  renderSuggestion(match: FuzzyMatch<MapImageChoice>, el: HTMLElement): void {
    const choice = match.item;
    el.addClass('mod-complex', 'atlas-link-choice');
    setIcon(el.createDiv({ cls: 'atlas-link-choice__icon' }), choice.path ? 'map' : 'square-dashed');
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: choice.name });
    if (choice.collection) content.createDiv({ cls: 'suggestion-note', text: choice.collection });
  }

  onChooseItem(choice: MapImageChoice): void {
    this.onChoose(choice.path);
  }
}

/** Opens the picker once the library is read; `onChoose` gets the picked image's path, or null for none. */
export async function pickMapImage(app: App, collection: string | null, onChoose: (path: string | null) => void, pick: MapImagePick = 'map'): Promise<void> {
  new MapImagePickerModal(app, await mapImageChoices(app, collection, pick), onChoose, pick).open();
}
