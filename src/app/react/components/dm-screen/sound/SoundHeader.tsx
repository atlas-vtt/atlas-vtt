import React, { useId } from 'react';
import { t } from '../../../../i18n';
import { SegmentedControl, type SegmentedOption } from '../../../../packages/components/primitives/SegmentedControl';
import { Select } from '../../../../packages/components/primitives/Select';
import type { SoundView } from '../../../../types/viewUIState';
import { useAtlasStore } from '../../../ViewStoreContext';
import type { CollectionChoice } from './useSound';

const VIEWS: readonly SegmentedOption<SoundView>[] = [
  { value: 'moods', label: t('audio.view.moods') },
  { value: 'library', label: t('audio.view.library') },
];

/** What stands in the DM screen's top row while the Sound page shows. */
export function SoundHeader({ collections, collectionId, setCollectionId }: CollectionChoice): React.JSX.Element {
  const view = useAtlasStore((state) => state.soundView);
  const setView = useAtlasStore((state) => state.setSoundView);
  const labelId = useId();
  return (
    <>
      <SegmentedControl className="atlas-sound-views" value={view} options={VIEWS} onChange={setView} ariaLabel={t('audio.views')} roving />
      {collections.length > 1 && collectionId !== null && (
        <div className="atlas-sound-collection">
          <span id={labelId} hidden>{t('audio.collection')}</span>
          <Select value={collectionId} options={collections.map(({ id, name }) => ({ value: id, label: name }))} onChange={setCollectionId} labelledBy={labelId} />
        </div>
      )}
    </>
  );
}
