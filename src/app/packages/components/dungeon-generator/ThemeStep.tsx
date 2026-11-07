import React, { useId, useRef } from 'react';
import { THEME_IDS, type ThemeChoice, type ThemeId } from '../../../dungeons/themes/themeTypes';
import { type MessageKey, t } from '../../../i18n';
import { cn } from '../../../../utils/cn';
import { Skeleton } from '../primitives/Skeleton';
import { ARROW_STEPS, useHeldPicture } from './StyleGallery';

const CHOICES: readonly ThemeChoice[] = ['any', ...THEME_IDS];

export const themeName = (theme: ThemeId): string => t(`dungeon.theme.${theme}` as MessageKey);

interface ThemeStepProps {
  value: ThemeChoice;
  /** The theme Surprise me gave the dungeon shown, named on its card while it is chosen. */
  picked: ThemeId | undefined;
  /** Each theme's picture of the dungeon asked for, once drawn. */
  previews: ReadonlyMap<ThemeId, ImageBitmap>;
  /** The first card's art, measured for the size the pictures are drawn at. */
  onArt: (art: HTMLSpanElement | null) => void;
  onChange: (theme: ThemeChoice) => void;
}

/** A picture of a theme, held until the next arrives; a breathing skeleton before the first. */
function ThemePicture({ bitmap, className }: { bitmap: ImageBitmap | undefined; className?: string }): React.JSX.Element {
  const { canvas, shown } = useHeldPicture(bitmap);

  return (
    <span className={cn('atlas-dungeon-theme__picture', className)}>
      <canvas ref={canvas} hidden={!shown} aria-hidden="true" />
      {!shown && <Skeleton live className="atlas-dungeon-theme__skeleton" />}
    </span>
  );
}

/**
 * The themes as cards, each a picture of the dungeon asked for drawn in that theme with its name
 * on it (Surprise me shows the three side by side), in one radio group: Tab reaches the chosen
 * card and the arrows choose another at once, so the preview beside the wizard shows each theme
 * in turn.
 */
export function ThemeStep({ value, picked, previews, onArt, onChange }: ThemeStepProps): React.JSX.Element {
  const buttons = useRef(new Map<ThemeChoice, HTMLButtonElement>());
  const pickedId = useId();

  const onKeyDown = (index: number) => (event: React.KeyboardEvent): void => {
    const step = ARROW_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = CHOICES[(index + step + CHOICES.length) % CHOICES.length]!;
    onChange(next);
    buttons.current.get(next)?.focus();
  };

  return (
    <div className="atlas-dungeon-themes" role="radiogroup" aria-label={t('dungeon.theme.label')}>
      {CHOICES.map((choice, index) => {
        const chosen = choice === value;
        const showsPicked = choice === 'any' && chosen && picked !== undefined;
        return (
          <button
            key={choice}
            ref={(button) => {
              if (button) buttons.current.set(choice, button);
              else buttons.current.delete(choice);
            }}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            aria-describedby={showsPicked ? pickedId : undefined}
            className={cn('atlas-dungeon-theme', chosen && 'atlas-active')}
            onClick={() => onChange(choice)}
            onKeyDown={onKeyDown(index)}
          >
            <span ref={index === 1 ? onArt : undefined} className="atlas-dungeon-theme__art">
              {choice === 'any'
                ? THEME_IDS.map((theme) => <ThemePicture key={theme} bitmap={previews.get(theme)} className="atlas-dungeon-theme__slice" />)
                : <ThemePicture bitmap={previews.get(choice)} />}
              {showsPicked && (
                <span className="atlas-dungeon-theme__picked" aria-hidden="true">{themeName(picked)}</span>
              )}
              <span className="atlas-dungeon-card-name">{choice === 'any' ? t('dungeon.theme.any') : themeName(choice)}</span>
            </span>
            {/* What Surprise me picked, read as the card's description rather than its name */}
            {showsPicked && <span id={pickedId} hidden>{t('dungeon.theme.anyPicked', { theme: themeName(picked) })}</span>}
          </button>
        );
      })}
    </div>
  );
}
