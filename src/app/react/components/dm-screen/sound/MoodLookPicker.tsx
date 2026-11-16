import React, { useEffect, useRef } from 'react';
import { t } from '../../../../i18n';
import type { Mood } from '../../../../sound/soundTypes';
import { MOOD_CREST_GROUPS, MOOD_TONE_NAMES, moodCrestPath, moodIcon, moodTone } from '../../../../soundLibrary/moodLook';
import { PIN_TONES } from '../../../../types/pinIcons';
import { WIDGET_ICON_VIEW_BOX } from '../../../../types/widgetIcons';
import { scrollWithin } from '../../../../utils/scrollWithin';
import { LabelTooltip, TooltipProvider } from '../../../../packages/components/primitives/tooltip';

type MoodLook = Pick<Mood, 'icon' | 'tone'>;

interface MoodLookPickerProps {
  look: MoodLook;
  onChange: (look: MoodLook) => void;
}

/** A mood's tone and crest. Both are radio groups; a tone is named by its label, a crest by its tooltip. Crests stand in groups by theme. */
export function MoodLookPicker({ look, onChange }: MoodLookPickerProps): React.JSX.Element {
  const icon = moodIcon(look);
  const tone = moodTone(look);
  const crests = useRef<HTMLDivElement>(null);
  // The crest it has may lie far down the list.
  useEffect(() => {
    const chosen = crests.current?.querySelector('[aria-checked="true"]');
    if (crests.current && chosen) scrollWithin(crests.current, chosen, 'nearest');
  }, []);
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={600}>
      <div className="atlas-sound-look" style={{ '--atlas-sound-tone-light': tone.light, '--atlas-sound-tone-dark': tone.dark } as React.CSSProperties}>
        <div className="atlas-sound-field">
          <span>{t('audio.mood.tone')}</span>
          <div className="atlas-sound-look__tones" role="radiogroup" aria-label={t('audio.mood.tone')}>
            {MOOD_TONE_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={PIN_TONES[name] === tone}
                aria-label={t(`audio.tone.${name}`)}
                className="atlas-sound-look__tone"
                style={{ '--atlas-sound-tone-light': PIN_TONES[name].light, '--atlas-sound-tone-dark': PIN_TONES[name].dark } as React.CSSProperties}
                onClick={() => onChange({ ...look, tone: name })}
              />
            ))}
          </div>
        </div>
        <div className="atlas-sound-field">
          <span>{t('audio.mood.crest')}</span>
          <div className="atlas-sound-look__crests" ref={crests} role="radiogroup" aria-label={t('audio.mood.crest')}>
            {MOOD_CREST_GROUPS.map((group) => (
              <div key={group.name} className="atlas-sound-look__group" role="group" aria-label={group.name}>
                <span className="atlas-sound-look__group-label" aria-hidden="true">{group.name}</span>
                <div className="atlas-sound-look__group-crests">
                  {group.crests.map((choice) => (
                    <LabelTooltip key={choice.id} label={choice.name}>
                      <button type="button" role="radio" aria-checked={choice.id === icon} aria-label={choice.name} className="atlas-sound-look__crest" onClick={() => onChange({ ...look, icon: choice.id })}>
                        <svg viewBox={WIDGET_ICON_VIEW_BOX} aria-hidden="true"><path d={moodCrestPath(choice.id)} /></svg>
                      </button>
                    </LabelTooltip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
