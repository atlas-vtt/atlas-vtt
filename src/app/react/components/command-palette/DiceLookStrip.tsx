import React from 'react';
import { cn } from '../../../../utils/cn';
import type { DiceLookChoice } from '../../../dice3d/diceLookChoices';
import { t } from '../../../i18n';

interface DiceLookStripProps {
  value: string;
  choices: readonly DiceLookChoice[];
  onChange: (id: string) => void;
  /** Rendered previews by choice value (`useLookPreviews`), for the looks that give no image of their own. */
  previews?: Readonly<Record<string, string>>;
}

/** Atlas's dice and the looks other plugins added, side by side, each with its image where it gives one. */
export function DiceLookStrip({ value, choices, onChange, previews = {} }: DiceLookStripProps): React.ReactElement {
  return (
    <div className="atlas-dice-colour-strip atlas-dice-colour-strip--looks" role="radiogroup" aria-label={t('dice.look.name')}>
      {choices.map((choice) => {
        const active = choice.value === value;
        const preview = choice.preview ?? (choice.loaded ? previews[choice.value] : undefined);
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn('atlas-dice-colour-strip__option', active && 'atlas-active', !choice.loaded && 'atlas-dice-colour-strip__option--missing')}
            onClick={() => onChange(choice.value)}
          >
            {preview
              ? <img className="atlas-dice-colour-strip__die" src={preview} alt="" draggable={false} />
              : <span className="atlas-dice-colour-strip__die atlas-dice-colour-strip__die--pending" aria-hidden="true" />}
            <span className="atlas-dice-colour-strip__label">{choice.label}</span>
          </button>
        );
      })}
    </div>
  );
}
