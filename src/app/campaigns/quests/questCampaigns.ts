import type { Campaign } from '../campaignTypes';
import type { Quest } from './questTypes';

/** What a quest note is matched against: a campaign's id, and its name for a note typed by hand. */
export type QuestCampaign = Pick<Campaign, 'id' | 'name'>;

/** The one campaign that bears `name` (in any case); undefined when none or several do. */
export function campaignNamed<T extends QuestCampaign>(name: string, campaigns: readonly T[]): T | undefined {
  const key = name.toLowerCase();
  const named = campaigns.filter((campaign) => campaign.name.toLowerCase() === key);
  return named.length === 1 ? named[0] : undefined;
}

/**
 * The campaign a quest note belongs to, among `campaigns`: the one it names by id, else the one
 * campaign that bears the name it names, until Atlas writes that campaign's id into the note
 * (`nameQuestCampaigns`). Undefined for none.
 */
export function campaignOfQuest<T extends QuestCampaign>(quest: Pick<Quest, 'campaign'>, campaigns: readonly T[]): T | undefined {
  return campaigns.find((campaign) => campaign.id === quest.campaign) ?? campaignNamed(quest.campaign, campaigns);
}

/** The quests of `quests` that belong to `campaign`, `campaigns` being every campaign of the vault. */
export function questsOfCampaign(quests: readonly Quest[], campaign: QuestCampaign, campaigns: readonly QuestCampaign[]): Quest[] {
  return quests.filter((quest) => campaignOfQuest(quest, campaigns)?.id === campaign.id);
}

/** The id to write into a quest note that names its campaign by name, or null when it names one by id, or a name that is no single campaign's. */
export function campaignIdToWrite(quest: Pick<Quest, 'campaign'>, campaigns: readonly QuestCampaign[]): string | null {
  if (campaigns.some((campaign) => campaign.id === quest.campaign)) return null;
  return campaignNamed(quest.campaign, campaigns)?.id ?? null;
}
