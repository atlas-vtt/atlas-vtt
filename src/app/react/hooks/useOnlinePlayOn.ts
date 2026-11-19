import { requireApiVersion } from 'obsidian';
import { SECRET_STORAGE_VERSION } from '../../account/tokenStore';
import { useExperimentalFeature } from './useExperimentalFeature';

/** Whether online play runs, as `registerOnlinePlay` decides: its switch on, in an Obsidian that keeps the account token safe. */
export function useOnlinePlayOn(): boolean {
  return useExperimentalFeature('onlinePlay') && requireApiVersion(SECRET_STORAGE_VERSION);
}
