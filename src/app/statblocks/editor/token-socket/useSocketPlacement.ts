import { useLayoutEffect, useState } from 'react';
import type React from 'react';
import { observeResize } from '../../../utils/observeResize';

/** The gap between the socket and its panel. */
const GAP = 8;
/** Below the socket unless less than this is left there and more above. */
const ROOM_BELOW = 420;

export interface SocketPlacement {
  /** The panel opens upward: the leaf has no room below the socket. */
  above: boolean;
  /** Where the panel's corner is, for the stylesheet (`position: fixed` in the socket's window). */
  style: React.CSSProperties & Record<`--${string}`, string>;
  /** Changes whenever the place does, so `useKeepInView` measures again. */
  key: string;
}

/** Which edge of the panel lines up with the same edge of its anchor. */
export type SocketAlign = 'start' | 'end';

/**
 * Where a panel hangs from the card: under its anchor (the token socket, a
 * recovery button; above where the leaf has no room below), its `align` edge
 * lined up with the anchor's, in the anchor's window. Followed while the panel
 * is open, as the card scrolls, the window resizes or the anchor changes size
 * (art linked or taken away), once per frame. Null while closed.
 */
export function useSocketPlacement(socket: HTMLElement | null, open: boolean, align: SocketAlign = 'end'): SocketPlacement | null {
  const [placement, setPlacement] = useState<SocketPlacement | null>(null);

  useLayoutEffect(() => {
    if (!open || !socket) {
      setPlacement(null);
      return undefined;
    }
    const win = socket.win;
    let frame = 0;
    const place = (): void => {
      frame = 0;
      const box = socket.getBoundingClientRect();
      const frameBox = (socket.closest('.workspace-leaf') ?? socket.doc.body).getBoundingClientRect();
      const below = frameBox.bottom - box.bottom;
      const above = below < ROOM_BELOW && box.top - frameBox.top > below;
      const side = Math.round(align === 'end' ? win.innerWidth - box.right : box.left);
      const edge = Math.round(above ? win.innerHeight - box.top + GAP : box.bottom + GAP);
      setPlacement((previous) => {
        const key = `${above ? 'a' : 'b'}${align}${side},${edge}`;
        if (previous?.key === key) return previous;
        const sideVar = align === 'end' ? '--atlas-sb-socket-right' : '--atlas-sb-socket-left';
        const style: SocketPlacement['style'] = above
          ? { [sideVar]: `${side}px`, '--atlas-sb-socket-bottom': `${edge}px` }
          : { [sideVar]: `${side}px`, '--atlas-sb-socket-top': `${edge}px` };
        return { above, style, key };
      });
    };
    const schedule = (): void => {
      if (!frame) frame = win.requestAnimationFrame(place);
    };
    place();
    socket.doc.addEventListener('scroll', schedule, true);
    win.addEventListener('resize', schedule);
    const stopObserving = observeResize([socket], schedule);
    return () => {
      stopObserving();
      if (frame) win.cancelAnimationFrame(frame);
      socket.doc.removeEventListener('scroll', schedule, true);
      win.removeEventListener('resize', schedule);
    };
  }, [socket, open, align]);

  return placement;
}
