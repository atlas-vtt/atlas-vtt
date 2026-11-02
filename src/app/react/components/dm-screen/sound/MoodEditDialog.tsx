import React, { useId, useRef, useState } from 'react';
import { t } from '../../../../i18n';
import { Button } from '../../../../packages/components/primitives/button';
import { CloseButton } from '../../../../packages/components/primitives/CloseButton';
import { SegmentedControl } from '../../../../packages/components/primitives/SegmentedControl';
import { Slider } from '../../../../packages/components/primitives/slider';
import { useDialogEscape } from '../../../../packages/components/primitives/useDialogEscape';
import { MAX_FADE_SECONDS } from '../../../../services/soundSettings';
import type { Mood } from '../../../../sound/soundTypes';
import { MoodLookPicker } from './MoodLookPicker';

type MusicChoice = 'list' | 'keep' | 'none';

interface MoodEditDialogProps {
  mood: Mood;
  onClose: () => void;
  onSave: (mood: Mood) => void;
}

const MUSIC_OPTIONS = [
  { value: 'list', label: t('audio.mood.musicList') },
  { value: 'keep', label: t('audio.mood.musicKeep') },
  { value: 'none', label: t('audio.mood.musicNone') },
] as const;

/** A mood's own facts. What sounds in it is made on the desk and saved from there. */
export function MoodEditDialog({ mood, onClose, onSave }: MoodEditDialogProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [name, setName] = useState(mood.name);
  const [fade, setFade] = useState(mood.fadeSeconds);
  const hasList = typeof mood.music === 'object';
  const [music, setMusic] = useState<MusicChoice>(typeof mood.music === 'object' ? 'list' : mood.music);
  const [look, setLook] = useState<Pick<Mood, 'icon' | 'tone'>>({ ...(mood.icon && { icon: mood.icon }), ...(mood.tone && { tone: mood.tone }) });
  useDialogEscape(ref, onClose);

  const save = (): void => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const listened = music === 'list' && typeof mood.music === 'object' ? mood.music : music === 'keep' ? 'keep' : 'none';
    onSave({ ...mood, ...look, name: trimmed, fadeSeconds: fade, music: listened });
    onClose();
  };

  return (
    <div className="atlas-sound-dialog-layer">
      <div className="atlas-sound-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="atlas-sound-dialog__header">
          <h3 id={titleId}>{t('audio.mood.editTitle')}</h3>
          <CloseButton onClick={onClose} />
        </div>
        <div className="atlas-sound-dialog__body">
          <label className="atlas-sound-field">
            <span>{t('audio.mood.name')}</span>
            <input type="text" value={name} autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} />
          </label>
          <MoodLookPicker look={look} onChange={setLook} />
          <div className="atlas-sound-field">
            <span>{t('audio.mood.fade')}</span>
            <div className="atlas-sound-level">
              <Slider value={[fade]} min={0} max={MAX_FADE_SECONDS} step={0.5} thumbLabels={[t('audio.mood.fade')]} onValueChange={([value]) => { if (value !== undefined) setFade(value); }} />
              <span className="atlas-sound-level__value">{t('audio.mood.fadeValue', { value: fade })}</span>
            </div>
          </div>
          <div className="atlas-sound-field">
            <span>{t('audio.mood.music')}</span>
            <SegmentedControl
              value={music}
              options={hasList ? MUSIC_OPTIONS : MUSIC_OPTIONS.slice(1)}
              onChange={setMusic}
              ariaLabel={t('audio.mood.music')}
            />
          </div>
          <div className="atlas-sound-dialog__actions">
            <Button type="button" onClick={save}>{t('common.save')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
