import type { App } from 'obsidian';
import type { CampaignStorage } from '../CampaignFiles';
import { CampaignService } from '../CampaignService';
import { campaignIdToWrite } from './questCampaigns';
import type { QuestIndex } from './QuestIndex';
import { nameCampaignById } from './questNotes';

/**
 * Writes the campaign's id into every quest note that names its campaign by name, as a GM typing a
 * note by hand does, once the name is the name of exactly one campaign; a note without an id of its
 * own is given one in the same write. A name that is no campaign's, or several's, stays as it is.
 * Each note is written at most once per version of it, so a write that fails is not tried again
 * until the note changes. Returns what stops it.
 */
export function nameQuestCampaigns(app: App, storage: CampaignStorage, index: QuestIndex): () => void {
  const tried = new Map<string, number>();
  const check = (): void => {
    const campaigns = new CampaignService(storage).list();
    const quests = index.all();
    const paths = new Set(quests.map((quest) => quest.path));
    for (const path of [...tried.keys()]) if (!paths.has(path)) tried.delete(path);
    for (const quest of quests) {
      const id = campaignIdToWrite(quest, campaigns);
      if (id === null || tried.get(quest.path) === quest.modified) continue;
      tried.set(quest.path, quest.modified);
      nameCampaignById(app, quest.path, quest.campaign, id).catch((error: unknown) => {
        console.error(`[Atlas] Could not name the campaign by its id in ${quest.path}:`, error);
      });
    }
  };
  const stops = [index.onChange(check), storage.onChange(check)];
  check();
  return () => {
    for (const stop of stops) stop();
  };
}
