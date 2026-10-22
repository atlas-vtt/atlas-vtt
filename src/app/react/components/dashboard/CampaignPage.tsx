import React from 'react';
import type { App } from 'obsidian';
import { ArrowLeft } from 'lucide-react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { Button } from '../../../packages/components/primitives/button';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { confirmAction } from '../../../ui/confirmDialog';
import { t } from '../../../i18n';
import { campaignHueStyle, PlayingMark } from './CampaignCard';
import { campaignActivity } from './relativeTime';
import { CampaignDescriptionField, CampaignNameField } from './CampaignFields';
import { CampaignSystemSetting } from './CampaignSystemSetting';
import { campaignSystemName } from './campaignSystemName';
import { useDiceSets } from '../../hooks/useDiceSets';
import type { WorldMapChoices } from './libraryPictures';
import { MapArt } from './MapArt';
import { PartyFaces } from './PartyFaces';
import { CampaignQuests } from './quests/CampaignQuests';
import { useWorldMapArtwork } from './useWorldMapArtwork';
import type { PartyFace } from './useCampaignParties';
import { WorldMapCard } from './WorldMapCard';
import { GameIcon } from '../GameIcon';
import { DASHBOARD_ICON_PATHS } from '../../../types/dashboardIconPaths';

interface CampaignPageProps {
  app: App;
  campaign: Campaign;
  /** Every campaign of the vault: a quest note is matched against all of them. */
  campaigns: readonly Campaign[];
  service: CampaignService;
  worldMaps: WorldMapChoices;
  presets: readonly SystemPreset[];
  /** Whether this device plays the campaign: its online table is open. */
  isPlaying: boolean;
  /** Ends the play of the campaign, once it was deleted while played. */
  onStop: () => void;
  /** The player characters on its last scene. */
  party: readonly PartyFace[];
  onBack: () => void;
}

/**
 * One campaign, around its world: the world map behind the page's head, fading into the page, the
 * name and its party over it (and whether its online table is open), then the world map to open
 * for its pins, the game system, the description and the quests, edited where they stand.
 */
export function CampaignPage({ app, campaign, campaigns, service, worldMaps, presets, isPlaying, onStop, party, onBack }: CampaignPageProps): React.JSX.Element {
  const locked = campaign.readOnly === true;
  const artwork = useWorldMapArtwork(app, service, campaign);
  const { sets } = useDiceSets(app);
  const choice = worldMaps.choices.find((candidate) => candidate.id === campaign.worldMap);
  const hasBackdrop = campaign.worldMap !== undefined;
  const systemName = campaign.system ? campaignSystemName(campaign.system, presets, sets).name : null;

  const deleteCampaign = async (): Promise<void> => {
    const confirmed = await confirmAction({
      title: t('campaign.deleteTitle', { name: campaign.name }),
      message: [t('campaign.deleteMessage')],
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!confirmed) return;
    service.delete(campaign.id);
    if (isPlaying) onStop();
  };

  return (
    <div className="campaign-page dashboard-page" data-backdrop={hasBackdrop || undefined} style={campaignHueStyle(campaign)}>
      <div className="campaign-backdrop" aria-hidden="true">
        {hasBackdrop && <MapArt app={app} path={artwork.path} pathPending={artwork.pending} thumbnailUrl={choice?.thumbnailUrl ?? null} />}
      </div>

      <div className="dashboard-container campaign-page__container">
        <Button variant="ghost" className="campaign-page__back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          <span>{t('campaign.backToDashboard')}</span>
        </Button>

        <header className="campaign-hero">
          <p className="campaign-hero__meta">
            {systemName !== null && (
              <>
                <span className="campaign-hero__system">{systemName}</span>
                <span className="dashboard-card__separator" aria-hidden="true">&middot;</span>
              </>
            )}
            <span>{campaignActivity(campaign)}</span>
          </p>
          <CampaignNameField campaign={campaign} service={service} disabled={locked} />
          {locked && <p className="campaign-page__locked">{t('campaign.newerVersion')}</p>}
          <div className="campaign-hero__actions">
            {isPlaying && (
              <span className="campaign-hero__playing">
                <PlayingMark />
              </span>
            )}
            <PartyFaces faces={party} size="page" />
          </div>
        </header>

        <div className="campaign-page__body">
          <aside className="campaign-page__side">
            <WorldMapCard app={app} campaign={campaign} service={service} worldMaps={worldMaps} artwork={artwork} disabled={locked} />
            <CampaignSystemSetting app={app} campaign={campaign} service={service} disabled={locked} />
          </aside>
          <div className="campaign-page__main">
            <CampaignDescriptionField campaign={campaign} service={service} disabled={locked} />
            <CampaignQuests app={app} campaign={campaign} campaigns={campaigns} service={service} disabled={locked} />
            <Button variant="ghost" className="campaign-page__delete" disabled={locked} onClick={() => { void deleteCampaign(); }}>
              <GameIcon path={DASHBOARD_ICON_PATHS['burning-book']} />
              <span>{t('campaign.delete')}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
