import React from 'react';
import { Play, Plus, X } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { Slider } from '../../packages/components/primitives/slider';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { MAX_TOKEN_SOUNDS, soundName } from '../../audio/tokenSounds';
import type { TokenSound } from '../../types/audioTypes';
import { EditTokenSection } from './EditTokenSections';
import { t } from '../../i18n';

/** The volume slider counts in percent, in steps of five. */
const PERCENT = 100;
const VOLUME_STEP = 5;

interface SoundRowProps {
  sound: Required<TokenSound>;
  onVolumeChange: (volume: number) => void;
  onPlay: () => void;
  onRemove: () => void;
}

/** One sound: its file's name, its volume, and buttons that play and remove it. */
function SoundRow({ sound, onVolumeChange, onPlay, onRemove }: SoundRowProps): React.ReactElement {
  const name = soundName(sound.path);
  return (
    <li className="atlas-edit-token__sound">
      <span className="atlas-edit-token__sound-name">{name}</span>
      <Slider
        className="atlas-edit-token__sound-volume"
        min={0}
        max={PERCENT}
        step={VOLUME_STEP}
        value={[Math.round(sound.volume * PERCENT)]}
        onValueChange={([percent = 0]) => onVolumeChange(percent / PERCENT)}
        thumbLabels={[t('editToken.soundVolume', { name })]}
        getValueText={(percent) => `${percent}%`}
      />
      <LabelTooltip label={t('editToken.playSound', { name })}>
        <Button variant="ghost" size="icon" className="atlas-edit-token__sound-button" onClick={onPlay}>
          <Play />
        </Button>
      </LabelTooltip>
      <LabelTooltip label={t('editToken.removeSound', { name })}>
        <Button variant="ghost" size="icon" className="atlas-edit-token__sound-button" onClick={onRemove}>
          <X />
        </Button>
      </LabelTooltip>
    </li>
  );
}

interface TokenSoundsSectionProps {
  sounds: readonly Required<TokenSound>[];
  onChange: (sounds: Required<TokenSound>[]) => void;
  /** Lets the GM choose a sound file to add. */
  onAdd: () => void;
  onPlay: (sound: Required<TokenSound>) => void;
}

/** The Edit Token dialog's section for the sounds the GM plays from the token's menu. */
export function TokenSoundsSection({ sounds, onChange, onAdd, onPlay }: TokenSoundsSectionProps): React.ReactElement {
  const full = sounds.length >= MAX_TOKEN_SOUNDS;
  return (
    <EditTokenSection title={t('editToken.sounds')}>
      <span className="atlas-edit-token__hint">{t('editToken.soundsHint')}</span>
      {sounds.length > 0 && (
        <ul className="atlas-edit-token__sounds" role="list" aria-label={t('editToken.sounds')}>
          {sounds.map((sound, index) => (
            <SoundRow
              key={`${index}:${sound.path}`}
              sound={sound}
              onVolumeChange={(volume) => onChange(sounds.map((other, i) => (i === index ? { ...other, volume } : other)))}
              onPlay={() => onPlay(sound)}
              onRemove={() => onChange(sounds.filter((_, i) => i !== index))}
            />
          ))}
        </ul>
      )}
      <div className="atlas-edit-token__sound-actions">
        <Button variant="outline" size="sm" disabled={full} onClick={onAdd}>
          <Plus />
          {t('editToken.addSound')}
        </Button>
        {full && <span className="atlas-edit-token__hint">{t('editToken.soundsFull', { max: MAX_TOKEN_SOUNDS })}</span>}
      </div>
    </EditTokenSection>
  );
}
