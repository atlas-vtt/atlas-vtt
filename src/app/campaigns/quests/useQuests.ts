import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import type { Campaign } from '../campaignTypes';
import { questsOfCampaign } from './questCampaigns';
import { QuestIndex } from './QuestIndex';
import type { Quest } from './questTypes';

const NONE: readonly Quest[] = [];
const ignoreChanges = (): (() => void) => () => undefined;

/**
 * The quest notes of `campaign`, main quests first, `campaigns` being every campaign of the vault;
 * follows every edit of a quest note from anywhere.
 */
export function useQuests(app: App, campaign: Campaign, campaigns: readonly Campaign[]): readonly Quest[] {
  const index = QuestIndex.forApp(app);
  const subscribe = useCallback((listener: () => void) => (index ? index.onChange(listener) : ignoreChanges()), [index]);
  const all = useSyncExternalStore(subscribe, () => index?.all() ?? NONE);
  return useMemo(() => questsOfCampaign(all, campaign, campaigns), [all, campaign, campaigns]);
}
