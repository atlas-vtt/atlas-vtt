import React, { useId } from 'react';
import { Play } from 'lucide-react';
import { RevealImage } from '../../../packages/components/primitives/RevealImage';
import { SkeletonGroup } from '../../../packages/components/primitives/Skeleton';
import { t } from '../../../i18n';
import { CardSkeleton } from './CardSkeleton';
import { formatRelativeTime } from './relativeTime';
import { lastActivity, type RecentScene } from './useRecentScenes';
import { GameIcon } from '../GameIcon';
import { PIN_ICON_PATHS } from '../../../types/pinIconPaths';

/** Placeholders while the scenes are read. */
const SKELETON_CARDS = 4;

interface RecentScenesProps {
  scenes: RecentScene[];
  isLoading: boolean;
  onOpenScene: (path: string) => void;
}

/** A scene as the map shows it, or a map glyph while it has no thumbnail. */
function SceneThumbnail({ scene }: { scene: RecentScene }): React.JSX.Element {
  const glyph = <span className="scene-card__glyph" aria-hidden="true"><GameIcon path={PIN_ICON_PATHS.map} /></span>;
  return scene.thumbnailUrl ? <RevealImage src={scene.thumbnailUrl} alt="" className="dashboard-card__image" fallback={glyph} /> : glyph;
}

/** The scenes played or changed last, after the one to continue, as cards with their thumbnails. Nothing while there are none. */
export function RecentScenes({ scenes, isLoading, onOpenScene }: RecentScenesProps): React.JSX.Element | null {
  const headingId = useId();
  if (!isLoading && scenes.length === 0) return null;

  return (
    <section className="dashboard-section" aria-labelledby={headingId}>
      <div className="dashboard-section__heading">
        <h2 id={headingId} className="dashboard-section__title">{t('dashboard.recent')}</h2>
      </div>
      {isLoading ? (
        <SkeletonGroup className="dashboard-grid scene-grid" label={t('dashboard.loadingScenes')}>
          {Array.from({ length: SKELETON_CARDS }, (_, index) => <CardSkeleton key={index} className="scene-card" />)}
        </SkeletonGroup>
      ) : (
        <div className="dashboard-grid scene-grid">
          {scenes.map((scene) => (
            <button key={scene.id} type="button" className="dashboard-card scene-card" onClick={() => onOpenScene(scene.path)}>
              <span className="dashboard-card__art scene-card__art">
                <SceneThumbnail scene={scene} />
                <span className="scene-card__play" aria-hidden="true"><Play /></span>
              </span>
              <span className="dashboard-card__body">
                <span className="dashboard-card__text">
                  <span className="dashboard-card__title">{scene.name}</span>
                  <span className="dashboard-card__meta">
                    <span className="dashboard-card__collection">{scene.collectionName}</span>
                    <span className="dashboard-card__separator" aria-hidden="true">&middot;</span>
                    <span>{formatRelativeTime(lastActivity(scene))}</span>
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
