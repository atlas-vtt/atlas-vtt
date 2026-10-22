import { TFile, App as ObsidianApp, base64ToArrayBuffer } from 'obsidian';
import type { AssetService, EncounterAsset } from '../services/AssetService';
import { generateEncounterThumbnail } from './encounterThumbnail';
import type { EncounterFormation } from './encounterFormation';
import './encounter-save-modal.scss';
import { runInBackground } from '../utils/backgroundTask';
import { getLocale, t } from '../i18n';
import { showNotice } from '../ui/notice';
import { createDialogShell } from '../ui/dialogShell';
import { trashVaultItem } from '../utils/trashVaultItem';
import { ENCOUNTER_THUMBNAIL_DIR, encounterThumbnailFile } from './encounterThumbnailFile';

/** One token as it will be stored inside an encounter. */
export type EncounterTokenDraft = EncounterAsset['tokens'][number];


/**
 * Asks for the encounter's name in Atlas' own dialog, which stacks above the asset
 * manager (an Obsidian modal opened from there lay underneath it).
 */
function promptForEncounterName(app: ObsidianApp, tokens: EncounterTokenDraft[]): Promise<string | null> {
  return new Promise((resolve) => {
    const { root, dialog } = createDialogShell(t('encounter.saveTitle'));
    dialog.createEl('p', { cls: 'atlas-text-dialog__message', text: t('encounter.createWith', { count: tokens.length }) });

    const previewContainer = dialog.createDiv({ cls: 'atlas-encounter-save-preview' });

    const thumbEl = previewContainer.createEl('img', { cls: 'atlas-encounter-save-thumbnail' });
    runInBackground(
      generateEncounterThumbnail(app, tokens).then((url) => { if (url) thumbEl.src = url; }),
      'Encounter thumbnail preview',
    );

    const list = previewContainer.createDiv();
    list.createEl('p', { text: t('encounter.tokens'), cls: 'setting-item-description' });
    const ul = list.createEl('ul', { cls: 'atlas-encounter-save-tokens' });
    tokens.forEach((token) => ul.createEl('li', { text: token.name }));

    const inputEl = dialog.createEl('input', {
      type: 'text',
      placeholder: t('encounter.namePlaceholder'),
      value: defaultEncounterName(),
      cls: 'atlas-encounter-save-input',
    });

    const close = (name: string | null): void => {
      root.remove();
      resolve(name);
    };
    const submit = (): void => {
      const name = inputEl.value.trim();
      if (name) close(name);
    };

    const actions = dialog.createDiv({ cls: 'atlas-text-dialog__actions' });
    actions.createEl('button', { text: t('common.cancel') }).addEventListener('click', () => close(null));
    actions.createEl('button', { text: t('encounter.save'), cls: 'mod-cta' }).addEventListener('click', submit);
    root.addEventListener('click', (event) => {
      if (event.target === root) close(null);
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target === inputEl) {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        close(null);
      }
    });

    inputEl.focus();
    inputEl.select();
  });
}

async function saveThumbnailToVault(app: ObsidianApp, tokens: EncounterTokenDraft[]): Promise<string> {
  const dataUrl = await generateEncounterThumbnail(app, tokens);
  if (!dataUrl) return '';

  try {
    const pngData = base64ToArrayBuffer(dataUrl.slice(dataUrl.indexOf(',') + 1));
    try { await app.vault.createFolder(ENCOUNTER_THUMBNAIL_DIR); } catch { /* exists */ }
    const path = `${ENCOUNTER_THUMBNAIL_DIR}/encounter-${Date.now()}.png`;
    await app.vault.createBinary(path, pngData);
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return app.vault.getResourcePath(file);
  } catch (error) {
    console.error('[encounterSaveService] Error saving thumbnail:', error);
  }
  return '';
}

/** The name an encounter gets when none is typed: today's date. */
export function defaultEncounterName(): string {
  return t('encounter.defaultName', { date: new Date().toLocaleDateString(getLocale()) });
}

/**
 * Persists a group of tokens as an encounter asset named `name` in `collectionId`. Pass
 * `formation` when the tokens carry cell/offset data captured from a map.
 * Resolves with the created asset, or null when saving failed.
 */
export async function storeEncounter(
  app: ObsidianApp,
  assetService: AssetService,
  collectionId: string,
  tokens: EncounterTokenDraft[],
  name: string,
  formation?: EncounterFormation,
): Promise<EncounterAsset | null> {
  if (tokens.length === 0) {
    showNotice(t('encounter.noTokens'));
    return null;
  }
  try {
    const thumbnailUrl = await saveThumbnailToVault(app, tokens);
    const encounter = await assetService.createEncounter({
      name,
      collection: collectionId,
      tokens,
      ...(formation ? { formation } : {}),
      difficulty: 'medium',
      tags: [],
      thumbnailUrl,
      data: { description: t('encounter.description', { count: tokens.length }) },
    });
    showNotice(t('encounter.saved', { name }));
    return encounter;
  } catch (error) {
    console.error('[encounterSaveService] Error saving encounter:', error);
    showNotice(t('encounter.saveFailed'));
    return null;
  }
}

/**
 * Gives a saved encounter a new name and tokens, with a thumbnail of them; its formation, tags and
 * difficulty stay. Resolves with whether it was saved.
 */
export async function updateEncounter(
  app: ObsidianApp,
  assetService: AssetService,
  encounterId: string,
  tokens: EncounterTokenDraft[],
  name: string,
): Promise<boolean> {
  if (tokens.length === 0) {
    showNotice(t('encounter.noTokens'));
    return false;
  }
  try {
    const current = await assetService.getAssetById(encounterId);
    if (current?.type !== 'encounter') throw new Error(`No encounter ${encounterId}`);
    const fresh = await saveThumbnailToVault(app, tokens);
    const thumbnailUrl = fresh || current.thumbnailUrl;
    await assetService.updateAsset(encounterId, {
      name,
      tokens,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      data: { ...current.data, tokens, description: t('encounter.description', { count: tokens.length }) },
    });
    // The new thumbnail replaces the old one, which nothing else shows.
    const replaced = fresh ? encounterThumbnailFile(app, current.thumbnailUrl) : null;
    if (replaced) await trashVaultItem(app, replaced);
    showNotice(t('encounter.saved', { name }));
    return true;
  } catch (error) {
    console.error('[encounterSaveService] Error updating encounter:', error);
    showNotice(t('encounter.saveFailed'));
    return false;
  }
}

/**
 * Prompts for a name and persists a group of tokens as an encounter (`storeEncounter`).
 * Resolves with the created asset, or null when the user cancelled or saving failed.
 */
export async function saveEncounter(
  app: ObsidianApp,
  assetService: AssetService,
  collectionId: string,
  tokens: EncounterTokenDraft[],
  formation?: EncounterFormation,
): Promise<EncounterAsset | null> {
  if (tokens.length === 0) {
    showNotice(t('encounter.noTokens'));
    return null;
  }
  const encounterName = await promptForEncounterName(app, tokens);
  if (!encounterName) return null;
  return storeEncounter(app, assetService, collectionId, tokens, encounterName, formation);
}
