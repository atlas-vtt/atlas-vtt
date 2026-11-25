import React from 'react';
import { Link2 } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import { DICE_COLOUR_OPTIONS, type DiceColour } from '../../../dice3d/diceLook';
import type { DicePreviews } from '../../../dice3d/dicePreviews';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

interface DiceColourStripProps {
  value: DiceColour;
  /** Rendered d20s per colour; a colour without one shows an empty well while it renders. */
  previews: DicePreviews;
  onChange: (colour: DiceColour) => void;
}

/** The dice colours side by side, each as the d20 it gives and named by its tooltip, to click; the chosen one ringed. */
export function DiceColourStrip({ value, previews, onChange }: DiceColourStripProps): React.ReactElement {
  const ring = previews.ring ? { '--atlas-dice-ring': `url("${previews.ring}")` } as React.CSSProperties : undefined;
  return (
    <div className="atlas-dice-colour-strip" role="radiogroup" aria-label={t('diceSettings.colour')} style={ring}>
      {DICE_COLOUR_OPTIONS.map((option) => {
        const preview = previews.images[option.value];
        const active = option.value === value;
        return (
          <LabelTooltip key={option.value} label={option.label}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              className={cn('atlas-dice-colour-strip__option', active && 'atlas-active')}
              onClick={() => onChange(option.value)}
            >
              {preview
                ? <img className="atlas-dice-colour-strip__die" src={preview} alt="" draggable={false} />
                : <span className="atlas-dice-colour-strip__die atlas-dice-colour-strip__die--pending" aria-hidden="true" />}
              {active && preview && ring && <span className="atlas-dice-colour-strip__ring" aria-hidden="true" />}
              {option.value === 'accent' && (
                // The accent die shares its colour with one of the others; the link says it is the accent's, and follows it.
                <span className="atlas-dice-colour-strip__follows" aria-hidden="true"><Link2 /></span>
              )}
            </button>
          </LabelTooltip>
        );
      })}
    </div>
  );
}
