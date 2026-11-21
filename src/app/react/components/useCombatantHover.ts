import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { TURN_KEY_ATTRIBUTE } from '../../initiative/motion/turnMotion';

/** How long the pointer rests on a card before its hover card opens; from one card to the next it follows at once. */
const OPEN_DELAY_MS = 350;
/** A card left for less than this opens the next at once, as if the pointer never left. */
const REOPEN_WINDOW_MS = 300;

/** The combatant under the pointer and its card in the list. */
export interface CombatantHover {
  id: string;
  card: HTMLElement;
}

export interface CombatantHoverTracking {
  /** The combatant whose hover card shows, or null. */
  hover: CombatantHover | null;
  /** Handlers for the list the cards are in. */
  listHandlers: {
    onPointerOver: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void;
  };
}

/** The combatant's card the pointer is over, or null between cards. */
function cardUnder(target: EventTarget | null): CombatantHover | null {
  const node = target as Node | null;
  if (!node || typeof node.instanceOf !== 'function' || !node.instanceOf(Element)) return null;
  const card = node.closest<HTMLElement>(`.atlas-initiative-card[${TURN_KEY_ATTRIBUTE}]`);
  const id = card?.getAttribute(TURN_KEY_ATTRIBUTE);
  return card && id ? { id, card } : null;
}

/**
 * Which combatant's hover card shows: the card the pointer rests on, after a moment, then whichever card it moves to,
 * at once. Between cards it stays with the last one. A mouse only (touch has no hover). It goes at once for any key
 * (Ctrl or Cmd opens the statblock there), press, wheel or right-click, and stays away from that card until the pointer
 * comes to another; Ctrl or Cmd held over a card keeps it away too. `blocked` (a drag, the statblock preview) keeps it
 * hidden.
 */
export function useCombatantHover(blocked: boolean): CombatantHoverTracking {
  const [hover, setHover] = useState<CombatantHover | null>(null);
  const under = useRef<CombatantHover | null>(null);
  const dismissed = useRef<string | null>(null);
  const openTimer = useRef<number | null>(null);
  const closedAt = useRef(Number.NEGATIVE_INFINITY);
  const shown = hover !== null;

  const cancelOpen = (): void => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    openTimer.current = null;
  };

  const close = (): void => {
    cancelOpen();
    setHover((current) => {
      if (current) closedAt.current = performance.now();
      return null;
    });
  };

  const onPointerOver = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.pointerType === 'touch') return;
    const next = cardUnder(event.target);
    // Between two cards: the last one stays
    if (!next || next.id === under.current?.id) return;
    under.current = next;
    if (dismissed.current !== next.id) dismissed.current = null;
    if (event.ctrlKey || event.metaKey) {
      dismissed.current = next.id;
      close();
      return;
    }
    cancelOpen();
    if (shown || performance.now() - closedAt.current < REOPEN_WINDOW_MS) {
      setHover(next);
      return;
    }
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      if (under.current === next && dismissed.current !== next.id) setHover(next);
    }, OPEN_DELAY_MS);
  };

  const onPointerLeave = (): void => {
    under.current = null;
    close();
  };

  // Anything the GM does with keys, buttons or the wheel takes the card away at once; nothing is stopped or prevented
  useEffect(() => {
    if (!shown) return undefined;
    const card = under.current?.card;
    const win = card?.ownerDocument.defaultView ?? window;
    const dismiss = (): void => {
      dismissed.current = under.current?.id ?? null;
      close();
    };
    const events = ['keydown', 'pointerdown', 'wheel', 'contextmenu'] as const;
    for (const type of events) win.addEventListener(type, dismiss, { capture: true, passive: true });
    return () => {
      for (const type of events) win.removeEventListener(type, dismiss, { capture: true });
    };
  }, [shown]);

  useEffect(() => cancelOpen, []);

  return { hover: blocked ? null : hover, listHandlers: { onPointerOver, onPointerLeave } };
}
