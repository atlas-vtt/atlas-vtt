import { TFile, type App, type Menu, type Plugin, type TAbstractFile } from 'obsidian';
import { AssetService } from '../services/AssetService';
import { cachedFrontmatter, frontmatterSource } from '../statblocks/notes/statblockSource';
import { formatServiceAsset } from '../packages/components/asset-manager/utils/assetFormatters';
import { spawnTokenAsset } from '../packages/components/asset-manager/utils/tokenSpawnService';
import { runInBackground } from '../utils/backgroundTask';
import { showNotice } from '../ui/notice';
import { t } from '../i18n';
import { diceRandom } from '../services/offlineDiceInputs';

/** Whether the metadata cache shows `file` as a statblock note: native, Fantasy Statblocks' frontmatter, or `statblock: inline`. */
function isStatblockNote(app: App, file: TAbstractFile): file is TFile {
  if (!(file instanceof TFile) || file.extension !== 'md') return false;
  const frontmatter = cachedFrontmatter(app, file);
  return frontmatterSource(frontmatter) !== null || frontmatter?.statblock === 'inline';
}

/**
 * Adds a creature of the statblock at `path` to the open scene's tracker, beside the map: a copy of
 * the library token that links the statblock, spawned as a placed token is (its statblock's values,
 * the collection's vision defaults, rolled hit points where the rules say so).
 */
export async function addStatblockCombatant(app: App, path: string): Promise<void> {
  const assets = AssetService.getInstance(app);
  const token = (await assets.getTokenAssets()).find((asset) => asset.statblockPath === path);
  if (!token) {
    showNotice(t('initiative.noStatblockToken'));
    return;
  }
  const shown = formatServiceAsset(token, '', app);
  if (shown.type === 'tokens') await spawnTokenAsset({ app, view: null, assetService: assets, random: diceRandom }, shown, 1, 'beside');
}

function addMenuItem(app: App, menu: Menu, file: TAbstractFile): void {
  if (!isStatblockNote(app, file)) return;
  menu.addItem((item) => item
    .setTitle(t('initiative.addStatblock'))
    .setIcon('list-plus')
    .onClick(() => runInBackground(addStatblockCombatant(app, file.path), `Adding ${file.path} to initiative`, t('initiative.addStatblockFailed'))));
}

/** The statblock note's file menu item "Add to initiative"; Obsidian drops the handler when the plugin unloads. */
export function registerStatblockInitiativeMenu(plugin: Plugin): void {
  const { app } = plugin;
  plugin.registerEvent(app.workspace.on('file-menu', (menu, file) => addMenuItem(app, menu, file)));
}
