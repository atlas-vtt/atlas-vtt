import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * The laid-out box of `el` inside `frame`, in pixels from the frame's top left: offsets, not the
 * drawn box, so a total still rising in (its own scale and translate) is recorded where it settles.
 */
function boxIn(el: HTMLElement, frame: HTMLElement): { left: number; top: number; height: number } {
  let left = 0;
  let top = 0;
  for (let at: HTMLElement | null = el; at && at !== frame; at = at.offsetParent as HTMLElement | null) {
    left += at.offsetLeft;
    top += at.offsetTop;
  }
  return { left, top, height: el.offsetHeight };
}

/** The carry: as long as the morph between large and row (`.atlas-dice-roll__clip`), on the same curve. */
const CARRY = { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' } as const;

/**
 * Carries a panel's total into its row when a newer roll shrinks the panel: the row's total
 * starts where and as large as the panel's total stood and moves into its place, so the number
 * travels instead of being swapped (a browser animation of its translate and scale, ending on
 * none, so it leaves nothing behind); the count goes on in the row from where it stood, so the
 * number does not change its digits at the hand-over. The panel's total is recorded after every
 * render while it stands.
 */
export function useTotalCarry(compact: boolean, reduced: boolean): {
  sheet: RefObject<HTMLDivElement | null>;
  large: RefObject<HTMLSpanElement | null>;
  row: RefObject<HTMLSpanElement | null>;
} {
  const sheet = useRef<HTMLDivElement | null>(null);
  const large = useRef<HTMLSpanElement | null>(null);
  const row = useRef<HTMLSpanElement | null>(null);
  const last = useRef<ReturnType<typeof boxIn> | null>(null);

  useLayoutEffect(() => {
    if (compact || !large.current || !sheet.current) return;
    last.current = boxIn(large.current, sheet.current);
  });

  useLayoutEffect(() => {
    const from = last.current;
    last.current = null;
    if (!compact || reduced || !from || !row.current || !sheet.current) return;
    const to = boxIn(row.current, sheet.current);
    if (to.height === 0) return;
    // `translate` and `scale`, not `transform`: nothing else moves the row's total, and its own place stays its own.
    row.current.animate([
      { transformOrigin: '0 0', translate: `${from.left - to.left}px ${from.top - to.top}px`, scale: `${from.height / to.height}` },
      { transformOrigin: '0 0', translate: '0 0', scale: '1' },
    ], CARRY);
  }, [compact, reduced]);

  return { sheet, large, row };
}
