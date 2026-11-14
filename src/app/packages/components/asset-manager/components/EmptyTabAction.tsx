import React from 'react';
import type { App } from 'obsidian';
import type { Tab } from '../types';
import type { AssetService } from '../../../../services/AssetService';
import { Button } from '../../primitives/button';
import { BestiaryTokensOffer } from './BestiaryTokensOffer';
import { t } from '../../../../i18n';

/**
 * The tabs a GM fills from the asset manager itself. Player characters are made from tokens, and scenes from maps (a
 * scene is an instance of a map), so neither tab offers to make one of its own.
 */
export type CreatableTab = Exclude<Tab, 'party' | 'scenes'>;

export interface EmptyTabActionProps {
  tab: Tab;
  app: App;
  assetService: AssetService | null;
  collection: string;
  /** Starts making an asset of the tab, as the header's create menu does. */
  onCreate: Record<CreatableTab, () => void>;
  /** Shows the Maps tab, where scenes are made. */
  onShowMaps: () => void;
}

/** The create menu's words for each tab, so an empty tab offers what the menu does. */
const CREATE_LABEL: Record<CreatableTab, () => string> = {
  tokens: () => t('am.header.createToken'),
  maps: () => t('am.header.addMap'),
  encounters: () => t('am.header.createEncounter'),
};

/**
 * What an empty tab offers: one button that makes its first asset. The Tokens
 * tab offers the starter tokens first, with that button beside them; the Players tab says how a token joins it, and
 * the Scenes tab where scenes come from (a map), with the way there.
 */
export function EmptyTabAction({ tab, app, assetService, collection, onCreate, onShowMaps }: EmptyTabActionProps): React.JSX.Element {
  if (tab === 'party') return <p>{t('am.empty.partyHint')}</p>;
  if (tab === 'scenes') {
    return (
      <>
        <p>{t('am.empty.scenesHint')}</p>
        <Button variant="default" className="atlas-empty-action" onClick={onShowMaps}>{t('am.empty.goToMaps')}</Button>
      </>
    );
  }
  const create = (
    <Button variant="default" className="atlas-empty-action" onClick={onCreate[tab]}>{CREATE_LABEL[tab]()}</Button>
  );
  if (tab !== 'tokens' || !assetService) return create;
  // Beside the free tokens, the GM's own: the same action, quieter.
  const createOwn = (
    <Button variant="outline" className="atlas-starter-offer__create" onClick={onCreate.tokens}>{CREATE_LABEL.tokens()}</Button>
  );
  return <BestiaryTokensOffer app={app} assets={assetService} collection={collection} variant="empty" fallback={create} secondary={createOwn} />;
}
