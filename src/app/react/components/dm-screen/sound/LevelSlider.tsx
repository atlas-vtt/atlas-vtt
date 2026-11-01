import React, { useState } from 'react';
import { Slider } from '../../../../packages/components/primitives/slider';
import { CHANNEL_DB_RANGE } from '../../../../services/soundSettings';

interface LevelSliderProps {
  value: number;
  label: string;
  disabled?: boolean;
  onChange: (db: number) => void;
  onCommit?: (db: number) => void;
}

const formatDb = (db: number): string => `${db > 0 ? '+' : ''}${Math.round(db)}`;

/** A fader in dB: each move goes straight to the gain, and only this slider draws it while it is held. */
export const LevelSlider = React.memo(function LevelSlider({ value, label, disabled = false, onChange, onCommit }: LevelSliderProps): React.JSX.Element {
  const [held, setHeld] = useState<number | null>(null);
  const shown = held ?? value;
  return (
    <div className="atlas-sound-level">
      <Slider
        value={[shown]}
        min={CHANNEL_DB_RANGE.min}
        max={CHANNEL_DB_RANGE.max}
        step={0.5}
        disabled={disabled}
        thumbLabels={[label]}
        getValueText={(db) => `${formatDb(db)} dB`}
        onValueChange={([db]) => {
          if (db === undefined) return;
          setHeld(db);
          onChange(db);
        }}
        onValueCommit={([db]) => {
          setHeld(null);
          if (db !== undefined) onCommit?.(db);
        }}
      />
      <span className="atlas-sound-level__value">{formatDb(shown)}</span>
    </div>
  );
});
