import React from 'react';
import type { App } from 'obsidian';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { Button } from '../../../packages/components/primitives/button';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { t } from '../../../i18n';
import atlasIconUrl from '../../../assets/brand/atlas-icon.webp';
import { CampaignsSection } from './CampaignsSection';
import { ContinueHero } from './ContinueHero';
import { useSceneArtwork, type WorldMapChoice } from './libraryPictures';
import { MapArt } from './MapArt';
import { RecentScenes } from './RecentScenes';
import type { CampaignParties } from './useCampaignParties';
import type { RecentScene } from './useRecentScenes';
import { GameIcon } from '../GameIcon';
import { DASHBOARD_ICON_PATHS } from '../../../types/dashboardIconPaths';

export interface HomePageProps {
  app: App;
  /** Null while the plugin has not opened the vault's campaigns. */
  service: CampaignService | null;
  campaigns: Campaign[];
  campaignsLoading: boolean;
  worldMaps: WorldMapChoice[];
  presets: readonly SystemPreset[];
  playingId: string | null;
  parties: CampaignParties;
  scenes: RecentScene[];
  scenesLoading: boolean;
  onOpenScene: (path: string) => void;
  onCreateMap: () => void;
  onOpenAssetManager: () => void;
  onOpenCampaign: (id: string) => void;
}

/**
 * Atlas' start screen: the scene to continue, the campaigns, the scenes played lately, and the ways
 * to make more. The last scene's colours glow faintly behind the top of the page.
 */
export function HomePage(props: HomePageProps): React.JSX.Element {
  const { app, scenes, scenesLoading, onOpenScene, onCreateMap, onOpenAssetManager } = props;
  const last = scenes[0] ?? null;
  const artwork = useSceneArtwork(app, last?.id ?? null, last?.thumbnailUrl ?? null);

  return (
    <>
      {last && (
        <div className="dashboard-ambient" aria-hidden="true">
          <MapArt app={app} path={artwork ?? null} pathPending={artwork === undefined} thumbnailUrl={last.thumbnailUrl} />
        </div>
      )}
      <main className="dashboard-container dashboard-home dashboard-page">
        <header className="dashboard-topbar">
          <h1 className="dashboard-wordmark">
            <img className="dashboard-wordmark__icon" src={atlasIconUrl} alt="" draggable={false} />
            Atlas<span>VTT</span>
          </h1>
          <div className="dashboard-topbar__actions">
            <Button variant="ghost" className="dashboard-topbar__action" onClick={onOpenAssetManager}>
              <GameIcon path={DASHBOARD_ICON_PATHS['open-chest']} />
              <span>{t('dashboard.assets')}</span>
            </Button>
            <Button variant="ghost" className="dashboard-topbar__action" onClick={onCreateMap}>
              <GameIcon path={DASHBOARD_ICON_PATHS['quill-ink']} />
              <span>{t('dashboard.createScene')}</span>
            </Button>
          </div>
        </header>

        <ContinueHero app={app} scene={last} artwork={artwork} isLoading={scenesLoading} onOpenScene={onOpenScene} onCreateMap={onCreateMap} />

        {props.service && (
          <CampaignsSection
            app={app}
            service={props.service}
            campaigns={props.campaigns}
            isLoading={props.campaignsLoading}
            worldMaps={props.worldMaps}
            presets={props.presets}
            playingId={props.playingId}
            parties={props.parties}
            onOpenCampaign={props.onOpenCampaign}
          />
        )}

        <RecentScenes scenes={scenes.slice(1)} isLoading={scenesLoading} onOpenScene={onOpenScene} />
      </main>
    </>
  );
}
