/**
 * Importing a Fantasy Statblocks layout file (§6.2): the command "Import
 * Fantasy Statblocks layout…" picks one from the file system, the file menu
 * offers "Import as statblock template" on a JSON file of the vault. Offered
 * only while the `statblockEditor` switch is on.
 */

import { TFile, type App, type Menu, type Plugin, type TAbstractFile } from 'obsidian';
import { experimentalFeatureOn } from '../../../experimental/experimentalFeatures';
import { runInBackground } from '../../../utils/backgroundTask';
import { importLayoutFile } from './layoutImportFlow';
import { t } from '../../../i18n';

const FAILED = t('statblockEditor.fs.importFailed');

/** Asks for a layout file in the window of `doc` and imports it. */
export function pickLayoutFile(app: App, doc: Document): void {
  const input = doc.body.createEl('input', {
    type: 'file',
    cls: 'atlas-hidden-file-input',
    attr: { accept: '.json,application/json' },
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) runInBackground(file.text().then((text) => importLayoutFile(app, text, doc)), `Importing the layout ${file.name}`, FAILED);
  });
  input.addEventListener('cancel', () => input.remove());
  input.click();
}

/** "Import as statblock template" on a JSON file of the vault. */
export function addLayoutFileMenuItem(app: App, menu: Menu, file: TAbstractFile): void {
  if (!(file instanceof TFile) || file.extension !== 'json' || !experimentalFeatureOn(app, 'statblockEditor')) return;
  menu.addItem((item) => item
    .setTitle(t('statblockEditor.fs.importAs'))
    .setIcon('layout-template')
    .onClick(() => {
      runInBackground(
        app.vault.cachedRead(file).then((text) => importLayoutFile(app, text, activeDocument)),
        `Importing the layout ${file.path}`,
        FAILED,
      );
    }));
}

export function registerLayoutImportCommand(plugin: Plugin): void {
  const { app } = plugin;
  plugin.addCommand({
    id: 'import-fantasy-statblocks-layout',
    name: t('statblockEditor.fs.importCommand'),
    checkCallback: (checking) => {
      if (!experimentalFeatureOn(app, 'statblockEditor')) return false;
      if (!checking) pickLayoutFile(app, activeDocument);
      return true;
    },
  });
}
