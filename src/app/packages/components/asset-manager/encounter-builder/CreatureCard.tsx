import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { Plus } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LinkedStatblock } from '../../../../statblocks/render/LinkedStatblock';
import type { TokenVitals } from '../../../../services/statblockVitalsSync';
import { t } from '../../../../i18n';
import { stepQuantity, type Quantity } from '../../../../encounters/encounterQuantity';
import type { TokenAsset } from '../types';
import { CountStepper } from './CountStepper';
import { flashCard } from './flashCard';

interface CreatureCardProps {
  app: App;
  token: TokenAsset;
  count: Quantity;
  onCountChange: (token: TokenAsset, count: Quantity) => void;
  /** Whether the card is the feeds' tab stop (one card is, `useFeedKeys`). */
  tabbable: boolean;
  /** Its place among the creatures, from 1, and how many there are (WAI-ARIA feed). */
  position: number;
  setSize: number;
}

/** What a press on the statblock means for itself: its dice, links and fields, never adding the creature. */
const OWN_CONTROLS = 'a, button, input, textarea, select, summary, [role="button"], [contenteditable]:not([contenteditable="false"])';

/**
 * A creature of the feed, picked as cards are in a deck builder: a click on its statblock, or
 * Enter on the focused card, adds one (one die more where its number is rolled), and the notch on
 * its top edge says how many it holds and changes that (− n +), or offers Add.
 */
export function CreatureCard({ app, token, count, onCountChange, tabbable, position, setSize }: CreatureCardProps): React.JSX.Element {
  const picked = count !== 0;
  // The statblock shows the creature as its token looks, with or without its ring, as the DM screen does.
  const art = useMemo((): TokenVitals[] => [{ name: token.name, imagePath: token.imagePath, showRing: token.showRing }], [token.name, token.imagePath, token.showRing]);

  const addOne = (card: HTMLElement): void => {
    const more = stepQuantity(count, 1);
    if (more === count) return;
    onCountChange(token, more);
    flashCard(card);
  };

  const handleClick = (event: React.MouseEvent<HTMLElement>): void => {
    const target = event.target as Element;
    if (target.closest(OWN_CONTROLS) || target.closest('.atlas-encounter-card__notch')) return;
    // A drag that selected text is reading, not picking.
    if (!target.ownerDocument.getSelection()?.isCollapsed) return;
    addOne(event.currentTarget);
  };

  // Enter on the card itself; on a control inside it the key is that control's.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget || event.key !== 'Enter' || event.repeat) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    addOne(event.currentTarget);
  };

  return (
    <article
      className="atlas-encounter-card"
      data-picked={picked}
      data-token-id={token.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={token.name}
      aria-posinset={position}
      aria-setsize={setSize}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="atlas-encounter-card__notch">
        {picked ? (
          <CountStepper name={token.name} count={count} onChange={(next) => onCountChange(token, next)} />
        ) : (
          <Button
            variant="ghost"
            className="atlas-encounter-card__add"
            aria-label={t('encounter.builder.addNamed', { name: token.name })}
            onClick={() => onCountChange(token, 1)}
          >
            <Plus />
            {t('encounter.builder.add')}
          </Button>
        )}
      </div>
      {token.statblockPath && <LinkedStatblock app={app} path={token.statblockPath} variant="feed" tokens={art} />}
    </article>
  );
}
