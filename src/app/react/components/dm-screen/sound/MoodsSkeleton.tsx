import React from 'react';
import { t } from '../../../../i18n';
import { Skeleton, SkeletonGroup } from '../../../../packages/components/primitives/Skeleton';

/** Tiles shown while the moods are read: a few rows of the grid's own cells. */
const TILES = 6;

/** The moods' heading and tiles in the places the grid gives them, while the mood files are read. */
export function MoodsSkeleton(): React.JSX.Element {
  return (
    <>
      <div className="atlas-sound-moods__head">
        <h2 className="atlas-sound-section">{t('audio.mood.title')}</h2>
      </div>
      <SkeletonGroup label={t('audio.mood.loading')} className="atlas-sound-moods__grid">
        {Array.from({ length: TILES }, (_, index) => <Skeleton key={index} className="atlas-sound-mood__wait" />)}
      </SkeletonGroup>
    </>
  );
}
