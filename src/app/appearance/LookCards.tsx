import React, { useCallback, useId, useRef, useSyncExternalStore } from 'react';
import type { LookChoice, LookService } from './lookService';
import { LOOK_PICTURES } from './lookPictures';
import { t } from '../i18n';
import './look-cards.scss';

const LOOKS: readonly LookChoice[] = ['own', 'mediaeval', 'scifi'];

/** The look of this device, followed while the component shows. */
export function useLookChoice(looks: LookService): LookChoice {
  const subscribe = useCallback((changed: () => void) => looks.onChange(changed), [looks]);
  return useSyncExternalStore(subscribe, () => looks.get());
}

interface LookCardsProps {
  looks: LookService;
  /** `page` where the cards are the step's subject (the welcome wizard), `compact` under a setting's heading. */
  size: 'page' | 'compact';
}

/** The three looks as picture cards, one chosen: a radio group, so the arrow keys move the choice. */
export function LookCards({ looks, size }: LookCardsProps): React.JSX.Element {
  const look = useLookChoice(looks);
  const cards = useRef(new Map<LookChoice, HTMLButtonElement>());

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const next = choiceAfterKey(event.key, look);
    if (!next) return;
    event.preventDefault();
    // The wizard pages with the same arrows; inside the cards they move the choice.
    event.stopPropagation();
    looks.set(next);
    cards.current.get(next)?.focus();
  };

  return (
    <div className={`atlas-look-cards atlas-look-cards--${size}`} role="radiogroup" aria-label={t('appearance.look')} onKeyDown={onKeyDown}>
      {LOOKS.map((choice) => (
        <LookCard
          key={choice}
          choice={choice}
          chosen={choice === look}
          note={noteOf(choice, looks)}
          onPick={() => looks.set(choice)}
          cardRef={(element) => { if (element) cards.current.set(choice, element); else cards.current.delete(choice); }}
        />
      ))}
    </div>
  );
}

interface LookCardProps {
  choice: LookChoice;
  chosen: boolean;
  note: string;
  onPick: () => void;
  cardRef: (element: HTMLButtonElement | null) => void;
}

function LookCard({ choice, chosen, note, onPick, cardRef }: LookCardProps): React.JSX.Element {
  const id = useId();
  return (
    <button
      ref={cardRef}
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-note`}
      tabIndex={chosen ? 0 : -1}
      className="atlas-look-card"
      onClick={onPick}
    >
      <img className="atlas-look-card__picture" src={LOOK_PICTURES[choice]} alt="" draggable={false} />
      <span className="atlas-look-card__text">
        <span id={`${id}-name`} className="atlas-look-card__name">{t(`appearance.${choice}`)}</span>
        <span id={`${id}-note`} className="atlas-look-card__note">{note}</span>
      </span>
    </button>
  );
}

function noteOf(choice: LookChoice, looks: LookService): string {
  if (choice === 'mediaeval') return t('appearance.mediaevalNote');
  if (choice === 'scifi') return t('appearance.scifiNote');
  return looks.ownThemeName() || t('appearance.ownDefault');
}

/** The look an arrow, Home or End key moves the choice to, round the ends; null for any other key. */
function choiceAfterKey(key: string, current: LookChoice): LookChoice | null {
  const at = LOOKS.indexOf(current);
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return LOOKS[(at + 1) % LOOKS.length]!;
    case 'ArrowLeft':
    case 'ArrowUp':
      return LOOKS[(at + LOOKS.length - 1) % LOOKS.length]!;
    case 'Home':
      return LOOKS[0]!;
    case 'End':
      return LOOKS[LOOKS.length - 1]!;
    default:
      return null;
  }
}
