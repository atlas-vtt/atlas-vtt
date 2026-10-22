import type React from 'react';
import { useCallback } from 'react';
import { openContextMenuGlobal } from '../root/ContextMenuContext';
import { useAtlasStore, useViewStoreHook } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { placeCombatantOnMap } from '../../initiative/placeCombatant';
import { removeCombatant } from '../../initiative/offMapCombatants';
import type { TokenEntity } from '../../types';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import type { ListedSide } from '../../initiative/sides';
import { initiativeCardMenu, type CardMenuMode } from './initiativeCardMenu';

interface CardMenuInputs {
  tokens: Readonly<Record<string, TokenEntity>>;
  bySides: boolean;
  /** The sides as the tracker lists them. */
  sides: readonly ListedSide[];
  /** A fight by cards runs. */
  cards: boolean;
  fightRuns: boolean;
  /** Rolls one combatant with its statblock's modifier (`useInitiativeRolls`). */
  roll: (entryId: string) => void;
  /** The defeated combatants as their cards show them now; a delay passes the turn by them. */
  defeated: () => ReadonlySet<string>;
  /** Opens the edit popup of `entry` beside its card. */
  edit: (entry: InitiativeEntry, cardElement: HTMLElement) => void;
}

/** The other combatants holding a card a combatant may swap its own with: one per card, in the order they act. */
function swapTargets(entries: readonly InitiativeEntry[], entry: InitiativeEntry): CardMenuMode['swapTargets'] {
  const seen = new Set<number>();
  return [...entries].sort((a, b) => a.order - b.order).flatMap((other) => {
    if (other.card === undefined || other.card === entry.card || seen.has(other.card)) return [];
    seen.add(other.card);
    return [{ id: other.id, name: other.name, card: other.card }];
  });
}

/** Opens the menu of a combatant's card (`initiativeCardMenu`) with the store's actions. */
export function useInitiativeCardMenu(inputs: CardMenuInputs): (event: React.MouseEvent, entry: InitiativeEntry, cardElement: HTMLElement) => void {
  const { tokens, bySides, sides, cards, fightRuns, roll, defeated, edit } = inputs;
  const { view } = useAtlasUI();
  const store = useViewStoreHook();
  const swapInitiativeCards = useAtlasStore((s) => s.swapInitiativeCards);
  const moveToFront = useAtlasStore((s) => s.moveToFront);
  const moveToBack = useAtlasStore((s) => s.moveToBack);
  const updateTokens = useAtlasStore((s) => s.updateTokens);
  const setInitiativeSitsOut = useAtlasStore((s) => s.setInitiativeSitsOut);
  const delayInitiativeTurn = useAtlasStore((s) => s.delayInitiativeTurn);
  const actNowInInitiative = useAtlasStore((s) => s.actNowInInitiative);

  return useCallback((event: React.MouseEvent, entry: InitiativeEntry, cardElement: HTMLElement): void => {
    const targets = cards ? swapTargets(store.getState().initiative.entries, entry) : [];
    const entries = initiativeCardMenu(entry, tokens[entry.tokenId], { bySides, sides, cards, fightRuns, swapTargets: targets }, {
      roll: () => roll(entry.id),
      moveToFront: () => moveToFront(entry.id),
      moveToBack: () => moveToBack(entry.id),
      edit: () => edit(entry, cardElement),
      updateToken: (changes) => updateTokens([{ id: entry.tokenId, changes }]),
      setSitsOut: (sitsOut) => setInitiativeSitsOut(entry.id, sitsOut),
      swapCard: (withId) => swapInitiativeCards(entry.id, withId),
      delay: () => delayInitiativeTurn(entry.id, defeated()),
      actNow: () => actNowInInitiative(entry.id),
      placeOnMap: () => { if (view) placeCombatantOnMap(view, entry.tokenId); },
      remove: () => removeCombatant(store, entry, defeated()),
    });
    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  }, [store, view, tokens, bySides, sides, cards, fightRuns, roll, defeated, edit, swapInitiativeCards, moveToFront, moveToBack, updateTokens, setInitiativeSitsOut, delayInitiativeTurn, actNowInInitiative]);
}
