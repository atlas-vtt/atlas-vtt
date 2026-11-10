import type * as React from 'react';
import { useState } from 'react';
import type { TokenAsset } from '../types';
import { nextFeedIndex } from './feedNavigation';

/** A creature's card in the feeds, named by its token. */
export const CREATURE_CARD = '[data-token-id]';

export interface FeedKeys {
  /** The feeds' one tab stop: the creature focus was on last, else the first. */
  tabbableId: string | null;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLElement>) => void;
}

/** The card the event happened on; with `within`, also the card holding the control it happened on. */
function cardOf(target: EventTarget | null, within = false): HTMLElement | null {
  const node = target as Node | null;
  if (!node?.instanceOf?.(HTMLElement)) return null;
  return within ? node.closest<HTMLElement>(CREATURE_CARD) : node.matches(CREATURE_CARD) ? node : null;
}

/**
 * Roving focus over the encounter builder's creature cards (WAI-ARIA feed): the arrows move by
 * place through the feeds, Page Up and Down, Home and End through the list. Keys pressed on a
 * control inside a card (its statblock's dice, its count) stay that control's.
 */
export function useFeedKeys(creatures: readonly TokenAsset[], container: React.RefObject<HTMLElement | null>): FeedKeys {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const tabbableId = creatures.some((token) => token.id === focusedId) ? focusedId : creatures[0]?.id ?? null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const card = cardOf(event.target);
    if (!card) return;
    const cards = Array.from(container.current?.querySelectorAll<HTMLElement>(CREATURE_CARD) ?? []);
    const index = cards.indexOf(card);
    if (index === -1) return;
    const next = nextFeedIndex(cards.map((element) => element.getBoundingClientRect()), index, event);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    const target = cards[next]!;
    setFocusedId(target.dataset.tokenId ?? null);
    target.focus();
  };

  const onFocus = (event: React.FocusEvent<HTMLElement>): void => {
    const id = cardOf(event.target, true)?.dataset.tokenId;
    if (id) setFocusedId(id);
  };

  return { tabbableId, onKeyDown, onFocus };
}
