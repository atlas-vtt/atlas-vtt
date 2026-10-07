import type { App } from 'obsidian';
import { customLook } from '../app/dice3d/customLooks';
import { SettingsService } from '../app/services/SettingsService';
import { collectionDiceLookId } from '../app/services/mapDiceLook';
import { frozenCopy } from './frozen';
import { loadedAssets } from './scenes';
import type { DiceApi, DiceLookInEffect } from './types/dice';

/** The longest look id `useLook` takes, the extension id and separator included. */
const MAX_LOOK_ID = 300;

function fullLookId(extensionId: string, lookId: unknown): string | undefined {
  if (lookId === null) return undefined;
  if (typeof lookId !== 'string') throw new Error('[Atlas API] dice.useLook: "lookId" must be a string or null.');
  if (lookId === '') return '';
  const full = `${extensionId}:${lookId}`;
  if (full.length > MAX_LOOK_ID) throw new Error(`[Atlas API] dice.useLook: "lookId" must be at most ${MAX_LOOK_ID - extensionId.length - 1} characters.`);
  return full;
}

function collectionOption(options: unknown): string | null {
  if (options === undefined) return null;
  const id: unknown = typeof options === 'object' && options !== null ? Reflect.get(options, 'collectionId') : 0;
  if (id === undefined) return null;
  if (typeof id !== 'string' || id === '') throw new Error('[Atlas API] dice.useLook: the options must be { collectionId?: string }.');
  return id;
}

const isLoaded = (lookId: string): boolean => lookId === '' || customLook(lookId) !== null;

/** `dice.useLook` and `dice.lookFor` (`dice-look-choice`): the GM's default in the settings, a collection's choice in the index. */
export function diceLookChoiceFor(app: App, extensionId: string): Pick<Required<DiceApi>, 'useLook' | 'lookFor'> {
  return {
    useLook: async (lookId: string | null, options?: { collectionId?: string }): Promise<void> => {
      const full = fullLookId(extensionId, lookId);
      const collectionId = collectionOption(options);
      if (collectionId === null) {
        SettingsService.forApp(app)?.setDiceLookId(full ?? '');
        return;
      }
      const assets = await loadedAssets(app);
      const written = await assets.runExclusive(() => assets.updateCollectionIndexData(collectionId, { diceLookId: full }));
      if (!written) throw new Error(`[Atlas API] dice.useLook: there is no collection with the id "${collectionId}".`);
    },
    lookFor: async (collectionId?: string | null): Promise<DiceLookInEffect> => {
      if (typeof collectionId === 'string') await loadedAssets(app);
      const own = typeof collectionId === 'string' ? collectionDiceLookId(app, collectionId) : undefined;
      const lookId = own ?? SettingsService.forApp(app)?.getDiceLookId() ?? '';
      return frozenCopy({ lookId, from: own === undefined ? 'default' : 'collection', loaded: isLoaded(lookId) });
    },
  };
}
