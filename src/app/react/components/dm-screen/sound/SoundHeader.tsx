import React, { useId } from 'react';
import { t } from '../../../../i18n';
import { Select } from '../../../../packages/components/primitives/Select';
import type { CollectionChoice } from './useSound';

/** What stands in the DM screen's top row while the Sound page shows. */
export function SoundHeader({ collections, collectionId, setCollectionId }: CollectionChoice): React.JSX.Element | null {
  const labelId = useId();
  if (collections.length <= 1 || collectionId === null) return null;
  return (
    <div className="atlas-sound-collection">
      <span id={labelId} hidden>{t('audio.collection')}</span>
      <Select value={collectionId} options={collections.map(({ id, name }) => ({ value: id, label: name }))} onChange={setCollectionId} labelledBy={labelId} />
    </div>
  );
}
