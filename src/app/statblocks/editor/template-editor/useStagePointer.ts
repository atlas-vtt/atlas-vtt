/**
 * What the pointer does over the canvas without a click: the block it points
 * at (read from the surface's hover store, `interaction/`), and the gap it
 * rests in, which grows a `+` line after 150 ms (§7.6). Both leave the card's
 * render alone: the hover is an attribute on the block's frame, the gap state
 * lives here.
 */

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { HoverStore, hoverStoreOf } from '../interaction/hoverStore';
import { LIVE_TABLE_ATTRIBUTE } from '../table/EditableTable';
import { gapUnder, sameGap, type CanvasGap } from './canvasGaps';

/** How long the pointer rests in a gap before the `+` line shows. */
export const GAP_DELAY_MS = 150;
/** Elements of the chrome itself: over them the gap stays as it is. */
const CHROME = '.atlas-te-chrome-control';
/** A Table typed in place, with its handles and add buttons round it: over it there is no gap, its own add bars are there. */
const LIVE_TABLE = `[${LIVE_TABLE_ATTRIBUTE}]`;

const NO_STORE = new HoverStore();

/**
 * The block under the pointer, as the stage's hover store has it (the
 * surface's one hover: its frame carries `data-sb-hover`, its handle stands
 * in the gutter); null off the blocks.
 */
export function useHoveredBlock(stageRef: RefObject<HTMLElement | null>): string | null {
  const [store, setStore] = useState<HoverStore>(NO_STORE);
  useEffect(() => {
    if (stageRef.current) setStore(hoverStoreOf(stageRef.current));
  }, [stageRef]);
  const { target } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return target?.kind === 'block' ? target.blockId : null;
}

/** The gap the pointer has rested in for `GAP_DELAY_MS`; null elsewhere, and always while `enabled` is off. */
export function useStageGap(stageRef: RefObject<HTMLElement | null>, enabled: boolean): CanvasGap | null {
  const [gap, setGap] = useState<CanvasGap | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !enabled) {
      setGap(null);
      return undefined;
    }
    const win = stage.win;
    let pending: CanvasGap | null = null;
    let timer = 0;
    const move = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (!target?.closest || target.closest(CHROME)) return;
      const box = stage.getBoundingClientRect();
      const found = target.closest(LIVE_TABLE) ? null : gapUnder(stage, target, { x: event.clientX - box.left, y: event.clientY - box.top });
      if (sameGap(found, pending)) return;
      pending = found;
      win.clearTimeout(timer);
      if (!found) {
        setGap(null);
        return;
      }
      timer = win.setTimeout(() => setGap(found), GAP_DELAY_MS);
    };
    const leave = (): void => {
      pending = null;
      win.clearTimeout(timer);
      setGap(null);
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerleave', leave);
    return () => {
      win.clearTimeout(timer);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerleave', leave);
    };
  }, [stageRef, enabled]);
  return gap;
}
