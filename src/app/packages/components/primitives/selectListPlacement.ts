import type React from 'react';
import { useLayoutEffect, useState } from 'react';
import { getDomHost } from '../../../host/dom';
import { LIST_FITS, fitList, type ListFit } from './popoverFit';
import { clippedViewFrame, viewFrame } from './useKeepInView';

/** Room between a select's trigger and its list (`atlas-select-popover`). */
export const LIST_GAP = 4;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

/**
 * Where a list lies in its layer: below or above its trigger, never taller than the room there, at
 * least as wide as the trigger, and from the trigger's end where it is wider than the room after its
 * start (`alignEnd`). Pure.
 */
export function layeredListStyle(
  trigger: Box,
  layer: Pick<Box, 'left' | 'top' | 'right' | 'bottom'>,
  fit: ListFit,
  gap = LIST_GAP,
  alignEnd = false,
): React.CSSProperties {
  return {
    ...(alignEnd ? { right: layer.right - trigger.right } : { left: trigger.left - layer.left }),
    minWidth: trigger.width,
    top: fit.up ? 'auto' : trigger.bottom - layer.top + gap,
    bottom: fit.up ? layer.bottom - trigger.top + gap : 'auto',
    maxHeight: fit.maxHeight ?? undefined,
  };
}

export interface ListPlacement {
  fit: ListFit;
  /** Where the list lies in its layer; empty where it hangs from its trigger. */
  style: React.CSSProperties;
  /** The list, wider than its trigger, would pass the view's end from the trigger's start, so it starts from the trigger's end. */
  alignEnd: boolean;
}

/** Whether a list `width` wide, set from its trigger's start, would pass the end of the room it can be seen in. Pure. */
export function listPassesEnd(trigger: Pick<Box, 'left' | 'right'>, width: number, frame: Pick<Box, 'left' | 'right'>): boolean {
  return trigger.left + width > frame.right && trigger.right - width >= frame.left;
}

/**
 * Places an open select's list before paint: above its trigger or shortened
 * where the view's edge, or a page around the trigger that scrolls, would cut
 * it. In a `layer` (an element over the view
 * that clips nothing) the list is placed by the trigger's box, and placed
 * again while anything scrolls or the window resizes, so a dialog that clips
 * its content never cuts it and opening it moves nothing.
 */
export function useListPlacement(
  open: boolean,
  trigger: React.RefObject<HTMLElement | null>,
  list: React.RefObject<HTMLElement | null>,
  layer: HTMLElement | null,
  count: number,
): ListPlacement {
  const [placement, setPlacement] = useState<ListPlacement>({ fit: LIST_FITS, style: {}, alignEnd: false });

  useLayoutEffect(() => {
    const button = trigger.current;
    const options = list.current;
    if (!open || !button || !options) {
      setPlacement({ fit: LIST_FITS, style: {}, alignEnd: false });
      return undefined;
    }
    // As it opens, before any placement capped it.
    const height = options.offsetHeight;
    const width = options.offsetWidth;
    const place = (): void => {
      const box = button.getBoundingClientRect();
      // A list in a layer floats over everything; one hanging from its trigger is cut by what clips the trigger's page.
      const frame = layer ? viewFrame(button) : clippedViewFrame(button);
      const fit = fitList(box, height, frame, LIST_GAP);
      const alignEnd = listPassesEnd(box, width, frame);
      setPlacement({ fit, alignEnd, style: layer ? layeredListStyle(box, layer.getBoundingClientRect(), fit, LIST_GAP, alignEnd) : {} });
    };
    place();
    if (!layer) return undefined;
    // The list scrolling its own options moves nothing.
    const scrolled = (event: Event): void => {
      if (!options.contains(event.target as Node | null)) place();
    };
    const win = getDomHost().ownerWindow(button);
    win.addEventListener('resize', place);
    win.addEventListener('scroll', scrolled, true);
    return () => {
      win.removeEventListener('resize', place);
      win.removeEventListener('scroll', scrolled, true);
    };
  }, [open, trigger, list, layer, count]);

  return placement;
}
