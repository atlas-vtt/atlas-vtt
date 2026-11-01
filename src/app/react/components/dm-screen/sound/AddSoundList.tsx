import React, { useMemo, useState } from 'react';
import { Music, Play, Plus, Square, Wind } from 'lucide-react';
import { t } from '../../../../i18n';
import type { SoundRecord } from '../../../../sound/soundTypes';
import { MAX_MOOD_LAYERS } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { showNotice } from '../../../../ui/notice';
import { IconAction } from './IconAction';
import { useSoundValue } from './useSound';

interface AddSoundListProps {
  director: SoundDirector;
  sounds: readonly SoundRecord[];
  onLibrary: () => void;
  onClose: () => void;
}

/** The collection's sounds, searched: a row adds its sound to the mix, its play button is heard by the GM alone. */
export function AddSoundList({ director, sounds, onLibrary, onClose }: AddSoundListProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const previewing = useSoundValue(director, (snapshot) => snapshot.previewing);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sounds.filter((sound) => words.every((word) => sound.name.toLowerCase().includes(word)));
  }, [query, sounds]);

  const add = (sound: SoundRecord): void => {
    if (director.desk.addSound(sound)) return;
    const full = sound.kind === 'ambience' && director.snapshot().mix.table.layers.length >= MAX_MOOD_LAYERS;
    showNotice(full ? t('audio.add.full', { count: MAX_MOOD_LAYERS }) : t('audio.add.refused', { name: sound.name }));
  };

  return (
    <div className="atlas-sound-add">
      <input
        type="search"
        autoFocus
        className="atlas-sound-add__search"
        placeholder={t('audio.add.search')}
        aria-label={t('audio.add.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          director.preview(null);
          onClose();
        }}
      />
      <ul className="atlas-sound-add__list">
        {shown.map((sound) => (
          <li key={sound.id} className="atlas-sound-add__row">
            <IconAction
              label={previewing === sound.id ? t('audio.stopPreview') : t('audio.previewSound', { name: sound.name })}
              icon={previewing === sound.id ? Square : Play}
              pressed={previewing === sound.id}
              onClick={() => director.preview(sound)}
            />
            <button type="button" className="atlas-sound-add__name" onClick={() => add(sound)}>
              {sound.kind === 'ambience' ? <Wind aria-hidden="true" /> : <Music aria-hidden="true" />}
              <span>{sound.name}</span>
              <Plus className="atlas-sound-add__plus" aria-hidden="true" />
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="atlas-sound-add__none">
            <span>{t('audio.add.none')}</span>
            <button type="button" className="atlas-sound-link" onClick={onLibrary}>{t('audio.add.library')}</button>
          </li>
        )}
      </ul>
    </div>
  );
}
