import { base64ToArrayBuffer, type App } from 'obsidian';
import assassin from '../assets/starter-tokens/assassin.webp?inline';
import cleric from '../assets/starter-tokens/cleric.webp?inline';
import fighter from '../assets/starter-tokens/fighter.webp?inline';
import knight from '../assets/starter-tokens/knight.webp?inline';
import occultist from '../assets/starter-tokens/occultist.webp?inline';
import paladin from '../assets/starter-tokens/paladin.webp?inline';
import ranger from '../assets/starter-tokens/ranger.webp?inline';
import rogue from '../assets/starter-tokens/rogue.webp?inline';
import warlock from '../assets/starter-tokens/warlock.webp?inline';
import wizard from '../assets/starter-tokens/wizard.webp?inline';
import type { AssetService } from './AssetService';
import { writeAssetImage } from './assetImageFiles';
import type { SettingsService } from './SettingsService';

interface StarterToken {
  name: string;
  /** The image as a data URL, inlined into the bundle. */
  image: string;
}

/**
 * Class tokens for players, ready in every vault: Sketch Studio's class and NPC icons
 * (commissioned by Maatlock of maatlockstavern.com, CC BY 4.0), redrawn in pencil
 * on parchment.
 */
export const STARTER_TOKENS: readonly StarterToken[] = [
  { name: 'Cleric', image: cleric },
  { name: 'Fighter', image: fighter },
  { name: 'Paladin', image: paladin },
  { name: 'Ranger', image: ranger },
  { name: 'Rogue', image: rogue },
  { name: 'Warlock', image: warlock },
  { name: 'Wizard', image: wizard },
  { name: 'Knight', image: knight },
  { name: 'Assassin', image: assassin },
  { name: 'Occultist', image: occultist },
];

const STARTER_TAG = 'Class';

/** The same id on every device, so two devices adding the starter tokens before they sync add one set. */
const STARTER_ID_PREFIX = 'token-starter-';
const starterTokenId = (name: string): string => `${STARTER_ID_PREFIX}${name.toLowerCase()}`;

/** Whether a record is one of the starter tokens every vault gets. */
export const isStarterTokenId = (id: string): boolean => id.startsWith(STARTER_ID_PREFIX);

/**
 * Adds the starter tokens to the default collection, once per vault. The flag
 * lives in the library file every device shares and is set before the first
 * write, so an interrupted run never adds a second set and tokens the user
 * deleted never come back. Images and records are written under the index lock,
 * so the vault check never adopts an image as a second asset.
 */
export async function addStarterTokens(app: App, assets: AssetService, settings: SettingsService): Promise<void> {
  // The flag another device set arrives with the library files, which the first vault check reads.
  await assets.vaultChecked();
  if (await assets.starterTokensAdded()) return;
  // Versions before the flag synced kept it in Atlas' settings.
  const addedBefore = settings.getSetting('starterTokensAdded');
  await assets.markStarterTokensAdded();
  if (addedBefore) return;

  await assets.runExclusive(async () => {
    const collection = assets.getDefaultCollectionId();
    const tag = await assets.createTag(collection, 'tokens', STARTER_TAG);
    for (const token of STARTER_TOKENS) {
      const data = base64ToArrayBuffer(token.image.slice(token.image.indexOf(',') + 1));
      const imagePath = await writeAssetImage(app, token.name, data);
      await assets.addTokenAsset(
        { name: token.name, imagePath, collection, tags: [tag.name], showRing: true },
        { userImport: false, id: starterTokenId(token.name) },
      );
    }
  });
  app.workspace.trigger('atlas-vtt:refresh-assets');
}
