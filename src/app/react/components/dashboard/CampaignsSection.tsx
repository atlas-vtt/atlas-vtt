import React, { useId, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { campaignsMatching } from '../../../campaigns/campaignSearch';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { HeaderSearch } from '../../../packages/components/asset-manager/components/HeaderSearch';
import { SkeletonGroup } from '../../../packages/components/primitives/Skeleton';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { t } from '../../../i18n';
import { CampaignCard } from './CampaignCard';
import { CardSkeleton } from './CardSkeleton';
import { campaignSystemName } from './campaignSystemName';
import { useDiceSets } from '../../hooks/useDiceSets';
import type { WorldMapChoice } from './libraryPictures';
import { NewCampaignField } from './NewCampaignField';
import type { CampaignParties } from './useCampaignParties';
import { GameIcon } from '../GameIcon';
import { DASHBOARD_ICON_PATHS } from '../../../types/dashboardIconPaths';

/** From this many campaigns on, the section offers a search. */
export const CAMPAIGN_SEARCH_FROM = 5;
/** Placeholders while the campaigns are read. */
const SKELETON_CARDS = 3;

interface CampaignsSectionProps {
  app: App;
  service: CampaignService;
  campaigns: Campaign[];
  /** The campaigns are being read for the first time. */
  isLoading: boolean;
  worldMaps: WorldMapChoice[];
  presets: readonly SystemPreset[];
  /** The campaign this device plays, or null. */
  playingId: string | null;
  parties: CampaignParties;
  onOpenCampaign: (id: string) => void;
}

/**
 * The campaigns as cards, the most recently played first, and the card that begins a new one, in
 * place. Many campaigns are searched by name and description.
 */
export function CampaignsSection({ app, service, campaigns, isLoading, worldMaps, presets, playingId, parties, onOpenCampaign }: CampaignsSectionProps): React.JSX.Element {
  const { sets } = useDiceSets(app);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');
  const headingId = useId();
  const found = useMemo(() => campaignsMatching(campaigns, search), [campaigns, search]);
  const searching = campaigns.length >= CAMPAIGN_SEARCH_FROM;
  const shown = searching ? found : campaigns;

  return (
    <section className="dashboard-section" aria-labelledby={headingId}>
      <div className="dashboard-section__heading">
        <h2 id={headingId} className="dashboard-section__title">{t('campaign.campaigns')}</h2>
        {searching && (
          <div className="dashboard-section__search">
            <HeaderSearch app={app} search={search} onSearch={setSearch} label={t('campaign.search')} shortcut={false} />
          </div>
        )}
      </div>
      {isLoading ? (
        <SkeletonGroup className="dashboard-grid campaign-grid" label={t('campaign.loading')}>
          {Array.from({ length: SKELETON_CARDS }, (_, index) => <CardSkeleton key={index} className="campaign-card" />)}
        </SkeletonGroup>
      ) : (
        <div className="dashboard-grid campaign-grid">
          {shown.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              app={app}
              campaign={campaign}
              service={service}
              worldMap={worldMaps.find((choice) => choice.id === campaign.worldMap)}
              systemName={campaign.system ? campaignSystemName(campaign.system, presets, sets).name : null}
              isPlaying={campaign.id === playingId}
              party={parties.get(campaign.id) ?? []}
              onOpen={() => onOpenCampaign(campaign.id)}
            />
          ))}
          {isCreating ? (
            <div className="dashboard-card campaign-card campaign-card--new is-naming">
              <NewCampaignField
                service={service}
                onCreated={(id) => { setIsCreating(false); setSearch(''); onOpenCampaign(id); }}
                onCancel={() => setIsCreating(false)}
              />
            </div>
          ) : (
            <button type="button" className="dashboard-card campaign-card campaign-card--new" onClick={() => setIsCreating(true)}>
              <span className="campaign-card__new-icon" aria-hidden="true"><GameIcon path={DASHBOARD_ICON_PATHS.banner} /></span>
              <span className="campaign-card__new-label">{t('campaign.new')}</span>
            </button>
          )}
        </div>
      )}
      {searching && found.length === 0 && <p className="dashboard-section__none">{t('campaign.noMatches')}</p>}
    </section>
  );
}
