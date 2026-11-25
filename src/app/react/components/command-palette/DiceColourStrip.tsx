import React, { useId } from 'react';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import { DICE_COLOUR_OPTIONS, type DiceColour } from '../../../dice3d/diceLook';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

interface DiceColourStripProps {
  value: DiceColour;
  /** Rendered d20s per colour; a colour without one shows an empty well while it renders. */
  previews: Partial<Record<DiceColour, string>>;
  onChange: (colour: DiceColour) => void;
}

/** The dice colours side by side, each as the d20 it gives and named by its tooltip, to click. */
export function DiceColourStrip({ value, previews, onChange }: DiceColourStripProps): React.ReactElement {
  const traceId = `atlas-dice-trace-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <div className="atlas-dice-colour-strip" role="radiogroup" aria-label={t('diceSettings.colour')}>
      <DieTrace id={traceId} />
      {DICE_COLOUR_OPTIONS.map((option) => {
        const preview = previews[option.value];
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
                ? <img className="atlas-dice-colour-strip__die" src={preview} alt="" draggable={false} style={active ? { filter: `url(#${traceId})` } : undefined} />
                : <span className="atlas-dice-colour-strip__die atlas-dice-colour-strip__die--pending" aria-hidden="true" />}
            </button>
          </LabelTooltip>
        );
      })}
    </div>
  );
}

/**
 * The chosen die's outline, as the chosen swatch's: a ring of the page's ink a little off its edge, following the die.
 * A CSS drop-shadow would trace the die's soft shadow on the table as well, so only the opaque body (alpha from 0.9,
 * where the shadow never reaches) is grown into the ring, which lies over that shadow.
 */
function DieTrace({ id }: { id: string }): React.ReactElement {
  return (
    <svg className="atlas-dice-colour-strip__trace" aria-hidden="true" focusable="false">
      <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        <feComponentTransfer in="SourceAlpha" result="body">
          <feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 1" />
        </feComponentTransfer>
        <feMorphology in="body" operator="dilate" radius="4" result="outer" />
        <feMorphology in="body" operator="dilate" radius="2" result="inner" />
        <feComposite in="outer" in2="inner" operator="out" result="ring" />
        <feGaussianBlur in="ring" stdDeviation="0.4" result="soft" />
        <feFlood className="atlas-dice-colour-strip__trace-colour" />
        <feComposite in2="soft" operator="in" result="outline" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="outline" />
        </feMerge>
      </filter>
    </svg>
  );
}
