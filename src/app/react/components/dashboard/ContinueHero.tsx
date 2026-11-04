import React from 'react';
import type { App } from 'obsidian';
import { Play } from 'lucide-react';
import { Skeleton, SkeletonGroup } from '../../../packages/components/primitives/Skeleton';
import { t } from '../../../i18n';
import { MapArt } from './MapArt';
import { formatRelativeTime } from './relativeTime';
import { lastActivity, type RecentScene } from './useRecentScenes';
import { GameIcon } from '../GameIcon';
import { DASHBOARD_ICON_PATHS } from '../../../types/dashboardIconPaths';
import { PIN_ICON_PATHS } from '../../../types/pinIconPaths';

interface ContinueHeroProps {
  app: App;
  /** The scene played last; null for a vault without scenes. */
  scene: RecentScene | null;
  /** The scene's map image (`useSceneArtwork`): null for none, undefined while it is read. */
  artwork: string | null | undefined;
  isLoading: boolean;
  onOpenScene: (path: string) => void;
  onCreateMap: () => void;
}

/** The hero's placeholder, in its own shape. */
function HeroSkeleton(): React.JSX.Element {
  return (
    <SkeletonGroup className="continue-hero continue-hero--loading" label={t('dashboard.loadingScenes')}>
      <span className="continue-hero__body">
        <span className="continue-hero__eyebrow"><Skeleton shape="text" width="40%" /></span>
        <span className="continue-hero__title"><Skeleton shape="text" width="80%" /></span>
        <span className="continue-hero__meta"><Skeleton shape="text" width="30%" /></span>
        <Skeleton shape="pill" className="continue-hero__cta" />
      </span>
    </SkeletonGroup>
  );
}

/** The scene played last, as the start screen's main card: one press continues it. */
function SceneHero({ app, scene, artwork, onOpenScene }: { app: App; scene: RecentScene; artwork: string | null | undefined; onOpenScene: (path: string) => void }): React.JSX.Element {
  return (
    <button type="button" className="continue-hero" onClick={() => onOpenScene(scene.path)}>
      <span className="continue-hero__art">
        <MapArt
          app={app}
          path={artwork ?? null}
          pathPending={artwork === undefined}
          thumbnailUrl={scene.thumbnailUrl}
          empty={<span className="continue-hero__glyph" aria-hidden="true"><GameIcon path={PIN_ICON_PATHS.map} /></span>}
        />
      </span>
      <span className="continue-hero__body">
        <span className="continue-hero__eyebrow">{t('dashboard.continue')}</span>
        <span className="continue-hero__title">{scene.name}</span>
        <span className="continue-hero__meta">{scene.collectionName} &middot; {formatRelativeTime(lastActivity(scene))}</span>
        <span className="continue-hero__cta">
          <Play aria-hidden="true" />
          <span>{t('dashboard.resume')}</span>
        </span>
      </span>
    </button>
  );
}

/** What to do next: continue the scene played last, or make the first scene of a new vault. */
export function ContinueHero({ app, scene, artwork, isLoading, onOpenScene, onCreateMap }: ContinueHeroProps): React.JSX.Element {
  if (isLoading) return <HeroSkeleton />;
  if (scene) return <SceneHero app={app} scene={scene} artwork={artwork} onOpenScene={onOpenScene} />;

  return (
    <button type="button" className="continue-hero continue-hero--empty" onClick={onCreateMap}>
      <span className="continue-hero__art" aria-hidden="true">
        <span className="continue-hero__glyph"><GameIcon path={PIN_ICON_PATHS.map} /></span>
      </span>
      <span className="continue-hero__body">
        <span className="continue-hero__eyebrow">{t('dashboard.begin')}</span>
        <span className="continue-hero__title">{t('dashboard.firstScene')}</span>
        <span className="continue-hero__meta">{t('dashboard.firstSceneMeta')}</span>
        <span className="continue-hero__cta">
          <GameIcon path={DASHBOARD_ICON_PATHS['quill-ink']} />
          <span>{t('dashboard.createScene')}</span>
        </span>
      </span>
    </button>
  );
}
