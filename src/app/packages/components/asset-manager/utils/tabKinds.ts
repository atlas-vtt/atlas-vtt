import type { Tab } from '../types';

/**
 * Whether a tab lists library tokens: the Characters tab and the Player characters tab, which
 * split the tokens between them, so no token is listed twice. Both show the same cards, menus,
 * creature filters, sorts and tags.
 */
export const isCharacterTab = (tab: Tab): boolean => tab === 'tokens' || tab === 'party';

/**
 * What a tab's cards are (`AnyAsset['type']`), which is also the tab whose vault folder holds
 * their files: player characters are tokens and stay in the tokens folder.
 */
export const assetTypeOfTab = (tab: Tab): Exclude<Tab, 'party'> => (tab === 'party' ? 'tokens' : tab);

/** Whether a tab shows folders. The party is a short list of its own, shown flat wherever its tokens lie. */
export const tabHasFolders = (tab: Tab): boolean => tab !== 'party';
