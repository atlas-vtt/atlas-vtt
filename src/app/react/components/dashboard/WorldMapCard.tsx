import React, { useId, useState } from 'react';
import type { App } from 'obsidian';
import { X } from 'lucide-react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { Button } from '../../../packages/components/primitives/button';
import { Skeleton, SkeletonGroup } from '../../../packages/components/primitives/Skeleton';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { showNotice } from '../../../ui/notice';
import { describeError } from '../../../utils/errors';
import { t } from '../../../i18n';
import type { WorldMapChoices } from './libraryPictures';
import { MapArt } from './MapArt';
import type { WorldMapArtwork } from './useWorldMapArtwork';
import { editWorldMap } from './worldMapScene';
import { WorldMapPicker } from './WorldMapPicker';
import { GameIcon } from '../GameIcon';
import { PIN_ICON_PATHS } from '../../../types/pinIconPaths';

interface WorldMapCardProps {
  app: App;
  campaign: Campaign;
  service: CampaignService;
  worldMaps: WorldMapChoices;
  /** The world map's artwork, the image players are shown. */
  artwork: WorldMapArtwork;
  disabled: boolean;
}

/**
 * The campaign's world map as a large picture. A press opens it in Atlas to place pins (a plain map
 * is made a scene first, since only a scene holds pins); it can be changed or removed below the
 * picture. Without one, the card offers to choose one.
 */
export function WorldMapCard({ app, campaign, service, worldMaps, artwork, disabled }: WorldMapCardProps): React.JSX.Element {
  const headingId = useId();
  const nameId = useId();
  const actionId = useId();
  const changeId = useId();
  const chooseId = useId();
  const [busy, setBusy] = useState(false);
  const choice = worldMaps.choices.find((candidate) => candidate.id === campaign.worldMap);
  const pick = (id: string): void => service.update(campaign.id, { worldMap: id });

  const open = (): void => {
    if (!choice) return;
    setBusy(true);
    editWorldMap(app, campaign, service, choice)
      .catch((error: unknown) => showNotice(t('campaign.openWorldMapFailed', { error: describeError(error) })))
      .finally(() => setBusy(false));
  };

  let card: React.JSX.Element;
  if (campaign.worldMap !== undefined && worldMaps.isLoading) {
    card = (
      <SkeletonGroup className="world-map-card__frame" label={t('campaign.loadingWorldMap')}>
        <Skeleton className="world-map-card__art" />
        <span className="world-map-card__footer">
          <span className="world-map-card__name">
            <span className="world-map-card__title"><Skeleton shape="text" width="55%" /></span>
            <span className="world-map-card__kind"><Skeleton shape="text" width="20%" /></span>
          </span>
        </span>
      </SkeletonGroup>
    );
  } else if (!choice) {
    card = (
      <WorldMapPicker
        choices={worldMaps.choices}
        value={undefined}
        onChange={pick}
        labelledBy={chooseId}
        disabled={disabled}
        className="world-map-card__picker"
        triggerClassName="world-map-card__frame world-map-card__choose"
      >
        <span className="world-map-card__art world-map-card__art--empty">
          <span className="world-map-card__emblem" aria-hidden="true"><GameIcon path={PIN_ICON_PATHS.map} /></span>
        </span>
        <span id={chooseId} className="world-map-card__choose-label">{t('campaign.chooseWorldMap')}</span>
      </WorldMapPicker>
    );
  } else {
    const makesScene = choice.kind === 'map';
    card = (
      <div className="world-map-card__frame">
        <button
          type="button"
          className="world-map-card__open"
          aria-labelledby={`${actionId} ${nameId}`}
          disabled={busy || (makesScene && disabled)}
          onClick={open}
        >
          <span className="world-map-card__art">
            <MapArt
              app={app}
              path={artwork.path}
              pathPending={artwork.pending}
              thumbnailUrl={choice.thumbnailUrl}
              empty={<span className="world-map-card__emblem" aria-hidden="true"><GameIcon path={PIN_ICON_PATHS.map} /></span>}
            />
          </span>
          <span className="world-map-card__action">
            <GameIcon path={PIN_ICON_PATHS.location} />
            <span id={actionId}>{t(makesScene ? 'campaign.makeWorldMapScene' : 'campaign.placePins')}</span>
          </span>
        </button>
        <div className="world-map-card__footer">
          <span className="world-map-card__name">
            <span id={nameId} className="world-map-card__title">{choice.name}</span>
            <span className="world-map-card__kind">{t(makesScene ? 'campaign.kindMap' : 'campaign.kindScene')}</span>
          </span>
          <WorldMapPicker
            choices={worldMaps.choices}
            value={campaign.worldMap}
            onChange={pick}
            labelledBy={`${changeId} ${headingId}`}
            disabled={disabled}
            className="world-map-card__change-picker"
            triggerClassName="world-map-card__change"
          >
            <span id={changeId}>{t('campaign.changeWorldMap')}</span>
          </WorldMapPicker>
          <LabelTooltip label={t('campaign.clearWorldMap')}>
            <Button
              variant="ghost"
              className="world-map-card__remove"
              disabled={disabled}
              onClick={() => service.update(campaign.id, { worldMap: '' })}
            >
              <X aria-hidden="true" />
            </Button>
          </LabelTooltip>
        </div>
      </div>
    );
  }

  return (
    <section className="world-map-card" aria-labelledby={headingId}>
      <h2 id={headingId} className="panel-heading">{t('campaign.worldMap')}</h2>
      {card}
    </section>
  );
}
