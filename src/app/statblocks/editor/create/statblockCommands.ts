/**
 * The statblock editor's commands and file menu items (§7.3): "New
 * statblock…", "New statblock here" on folders, "Edit statblock" on native
 * statblocks, and for Fantasy Statblocks' statblocks "Edit with an Atlas
 * template…" and "Copy into a new statblock". Registered always, offered only
 * while the `statblockEditor` switch is on, so switching it needs no reload.
 */

import { TFile, TFolder, type App, type Menu, type Plugin, type TAbstractFile } from 'obsidian';
import { experimentalFeatureOn } from '../../../experimental/experimentalFeatures';
import { runInBackground } from '../../../utils/backgroundTask';
import { startStatblockCreation } from './createFlow';
import { addLayoutFileMenuItem, registerLayoutImportCommand } from '../fs-import/fsImportCommands';
import { editInStatblockPane, opensStatblockEditor } from './entryPoints';
import {
  COPY_INTO_STATBLOCK, EDIT_WITH_TEMPLATE, isFsFrontmatterNote, mayHoldStatblockFence, menuPlace, offerFenceCopy, offerFsAdoption,
} from './fsStatblockActions';
import { t } from '../../../i18n';

/** Commands and the file menu name no collection: the role menu offers one. */
function newStatblock(app: App, folder?: string): void {
  runInBackground(startStatblockCreation(app, { collectionId: null, folder, from: 'command' }), 'Creating a statblock');
}

function adopt(app: App, file: TFile, event?: MouseEvent | KeyboardEvent): void {
  runInBackground(offerFsAdoption(app, file, menuPlace(event)), `Giving ${file.path} an Atlas template`, t('statblockEditor.changeFailed'));
}

function copyFence(app: App, file: TFile, event?: MouseEvent | KeyboardEvent): void {
  runInBackground(offerFenceCopy(app, file, menuPlace(event)), `Copying the statblock of ${file.path}`, t('statblockEditor.copyFailed'));
}

function addFileMenuItems(app: App, menu: Menu, file: TAbstractFile): void {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return;
  if (file instanceof TFolder) {
    menu.addItem((item) => item
      .setTitle(t('statblockEditor.newHere'))
      .setIcon('file-plus')
      .onClick(() => newStatblock(app, file.path)));
  } else if (file instanceof TFile && opensStatblockEditor(app, file.path)) {
    menu.addItem((item) => item
      .setTitle(t('statblockEditor.editInAtlas'))
      .setIcon('scroll-text')
      .onClick(() => { editInStatblockPane(app, file.path, { collectionId: null, from: 'command' }); }));
  } else if (file instanceof TFile && isFsFrontmatterNote(app, file)) {
    menu.addItem((item) => item.setTitle(EDIT_WITH_TEMPLATE).setIcon('layout-template').onClick((event) => adopt(app, file, event)));
  } else if (file instanceof TFile && mayHoldStatblockFence(app, file)) {
    menu.addItem((item) => item.setTitle(COPY_INTO_STATBLOCK).setIcon('copy-plus').onClick((event) => copyFence(app, file, event)));
  }
  addLayoutFileMenuItem(app, menu, file);
}

/** The active note, while the statblock editor is switched on and `fits` takes it. */
function activeNote(app: App, fits: (file: TFile) => boolean): TFile | null {
  const file = experimentalFeatureOn(app, 'statblockEditor') ? app.workspace.getActiveFile() : null;
  return file && fits(file) ? file : null;
}

export function registerStatblockEditorCommands(plugin: Plugin): void {
  const { app } = plugin;

  plugin.addCommand({
    id: 'new-statblock',
    name: t('statblockEditor.newStatblockMenu'),
    checkCallback: (checking) => {
      if (!experimentalFeatureOn(app, 'statblockEditor')) return false;
      if (!checking) newStatblock(app);
      return true;
    },
  });

  plugin.addCommand({
    id: 'edit-statblock',
    name: t('statblockEditor.editStatblock'),
    checkCallback: (checking) => {
      const file = activeNote(app, (candidate) => opensStatblockEditor(app, candidate.path));
      if (!file) return false;
      if (!checking) editInStatblockPane(app, file.path, { collectionId: null, from: 'command' });
      return true;
    },
  });

  plugin.addCommand({
    id: 'edit-with-atlas-template',
    name: EDIT_WITH_TEMPLATE,
    checkCallback: (checking) => {
      const file = activeNote(app, (candidate) => isFsFrontmatterNote(app, candidate));
      if (!file) return false;
      if (!checking) adopt(app, file);
      return true;
    },
  });

  plugin.addCommand({
    id: 'copy-into-new-statblock',
    name: COPY_INTO_STATBLOCK,
    checkCallback: (checking) => {
      const file = activeNote(app, (candidate) => mayHoldStatblockFence(app, candidate));
      if (!file) return false;
      if (!checking) copyFence(app, file);
      return true;
    },
  });

  registerLayoutImportCommand(plugin);
}

/** The file menu's items; Obsidian drops the handler when the plugin unloads. */
export function registerStatblockFileMenu(plugin: Plugin): void {
  const { app } = plugin;
  plugin.registerEvent(app.workspace.on('file-menu', (menu, file) => addFileMenuItems(app, menu, file)));
}
