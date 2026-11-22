import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { InitiativeState } from '../../types/initiativeTypes';
import { currentTurnKey } from '../../initiative/turnHolders';
import { playTurnMotion, snapshotTurn, type TurnSnapshot } from '../../initiative/motion/turnMotion';
import { enterList, exitList, morphList, type Outward } from '../../initiative/motion/listPresence';
import { TURN_FLASH_MS } from '../../services/playerInitiativeList';

/** What a change of the tracker's order is read by: the round, the turn and every combatant's place. */
function orderOf(initiative: InitiativeState): string {
  return JSON.stringify([initiative.round, initiative.sides?.active, initiative.sideOrder, initiative.entries.map((entry) => [entry.id, entry.order, entry.isActive, entry.delayed])]);
}

/**
 * The GM's cards glide to their new places when the order changes (the turn passed on or back, a reorder), as on the
 * players' list (`playTurnMotion`). Where they stood is read from the DOM as the store changes, before React draws the
 * new order, and the motion plays once it has. A reorder keeps the turn, and its cards glide straight to their places;
 * a dropped card glides from where it was let go, since a drag's `translate` is part of where it stood.
 */
export function useTurnMotion(store: StoreApi<ViewAtlasState>, list: RefObject<HTMLElement | null>): void {
  const before = useRef<{ places: TurnSnapshot; wrap: boolean } | null>(null);
  useEffect(() => store.subscribe((state, previous) => {
    if (before.current || state.initiative === previous.initiative || orderOf(state.initiative) === orderOf(previous.initiative)) return;
    before.current = { places: snapshotTurn(list.current), wrap: currentTurnKey(state.initiative) !== currentTurnKey(previous.initiative) };
  }), [store, list]);
  useLayoutEffect(() => {
    const snapshot = before.current;
    if (!snapshot) return;
    before.current = null;
    playTurnMotion(list.current, snapshot.places, { wrap: snapshot.wrap });
  });
}

/** Whether the turn of `initiative` just began (less than `TURN_FLASH_MS` ago): who holds it lights up once. A first look flashes nothing. */
export function useTurnFlash(initiative: InitiativeState): boolean {
  const key = currentTurnKey(initiative);
  const seen = useRef(key);
  const [flashing, setFlashing] = useState<string | null>(null);
  useEffect(() => {
    if (key === seen.current) return;
    seen.current = key;
    if (key === null) {
      setFlashing(null);
      return;
    }
    setFlashing(key);
    const timer = window.setTimeout(() => setFlashing((current) => (current === key ? null : current)), TURN_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [key]);
  return flashing !== null && flashing === key;
}

/**
 * The tracker comes and goes as the lists do (`enterList`, `exitList`): it stays drawn while it leaves, and a tracker
 * opened again meanwhile comes back from where it was. Its first drawing (a map opened with the tracker open) does not
 * move, and neither does a change while `instant` (a scene loading).
 */
export function useListPresence(open: boolean, element: HTMLElement | null, outward: Outward, instant = false): { drawn: boolean; leaving: boolean } {
  // Drawn from the render that opens it until its exit is over: a close must not unmount it before the exit plays
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const shown = useRef(open);
  const exit = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    // Opened while not drawn: it comes in once its element is there
    if (!element) {
      if (!open) shown.current = false;
      return;
    }
    if (shown.current === open) return;
    shown.current = open;
    if (instant) {
      exit.current?.cancel();
      exit.current = null;
      if (!open) setPresent(false);
      return;
    }
    if (open) {
      exit.current?.cancel();
      exit.current = null;
      enterList(element, outward);
      return;
    }
    const animation = exitList(element, outward);
    exit.current = animation;
    const done = (): void => {
      if (exit.current !== animation) return;
      exit.current = null;
      setPresent(false);
    };
    if (animation) animation.finished.then(done, done);
    else done();
  }, [open, element, outward, instant]);
  return { drawn: open || present, leaving: !open && present };
}

/**
 * The tracker changes its look when `look` changes (the compact view switched on or off): it glides from its old size to
 * its new one and its cards fade in anew (`morphList`). Its old size is read while React draws the new look, before the
 * page shows it.
 */
export function useLookMorph(element: HTMLElement | null, look: unknown): void {
  const shown = useRef(look);
  const from = useRef<{ width: number; height: number } | null>(null);
  if (look !== shown.current && element && from.current === null) from.current = { width: element.offsetWidth, height: element.offsetHeight };
  useLayoutEffect(() => {
    if (look === shown.current) return;
    shown.current = look;
    const size = from.current;
    from.current = null;
    if (element && size) morphList(element, size);
  }, [element, look]);
}
