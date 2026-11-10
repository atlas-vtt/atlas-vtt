import { useLayoutEffect, useState, type RefObject } from 'react';
import { clippedViewFrame } from '../../../../packages/components/primitives/useKeepInView';
import { observeResize } from '../../../../utils/observeResize';
import { placeStepPanel, type StepPanelPlace } from './stepPanelPlacement';
import { dieFanReach } from './trayLayout';

/** Where the open die lies in the tray's field, in px of its content: its centre and its box. */
export interface DiePlace {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TrayPlaces {
  die: DiePlace | null;
  /** In px of the tray, which holds the field and the panel. */
  panel: StepPanelPlace | null;
}

const NOWHERE: TrayPlaces = { die: null, panel: null };

const samePlaces = (a: TrayPlaces, b: TrayPlaces): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The places of the open die in the field and of its step panel in the tray
 * around the field. The panel lies outside the field, so the field's scrolling
 * never cuts it and it never makes the field scroll; it is fitted to the part
 * of the lab that can be seen. Dice are measured from the layout (offsets,
 * never boxes: a die gliding to its new place is measured where it lands), and
 * again whenever the tray, the field or the panel change size or anything
 * around them scrolls.
 */
export function useTrayPlaces(
  tray: RefObject<HTMLDivElement | null>,
  field: RefObject<HTMLDivElement | null>,
  panel: RefObject<HTMLDivElement | null>,
  openId: string | null,
  layoutKey: string,
): TrayPlaces {
  const [places, setPlaces] = useState<TrayPlaces>(NOWHERE);

  useLayoutEffect(() => {
    const outer = tray.current;
    const host = field.current;
    if (!outer || !host || openId === null) {
      setPlaces(NOWHERE);
      return undefined;
    }
    const measure = (): void => {
      const die = host.querySelector<HTMLElement>(`[data-die="${openId}"]`);
      const cell = die?.parentElement;
      if (!die || !cell) return;
      const width = die.offsetWidth;
      const height = die.offsetHeight;
      const x = die.offsetLeft + width / 2;
      const y = die.offsetTop + height / 2;
      const box = panel.current;
      let panelPlace: StepPanelPlace | null = null;
      if (box) {
        // The field's content in px of the tray
        const dx = host.offsetLeft + host.clientLeft - host.scrollLeft;
        const dy = host.offsetTop + host.clientTop - host.scrollTop;
        const origin = outer.getBoundingClientRect();
        const seen = clippedViewFrame(outer);
        // Over the stage, never over the sets and options beside it
        const stage = (outer.closest('.atlas-dice-lab__stage') ?? outer).getBoundingClientRect();
        const frame = {
          left: Math.max(seen.left, stage.left) - origin.left,
          top: Math.max(seen.top, stage.top) - origin.top,
          right: Math.min(seen.right, stage.right) - origin.left,
          bottom: Math.min(seen.bottom, stage.bottom) - origin.top,
        };
        const anchor = { x: x + dx, y: y + dy, top: die.offsetTop + dy, bottom: cell.offsetTop + cell.offsetHeight + dy, reach: dieFanReach(width, height) };
        // The whole content's height, also while a cap makes the panel scroll
        panelPlace = placeStepPanel(anchor, box.offsetWidth, box.scrollHeight, frame);
      }
      const next = { die: { x, y, width, height }, panel: panelPlace };
      setPlaces((last) => (samePlaces(last, next) ? last : next));
    };
    measure();
    const doc = outer.ownerDocument;
    doc.addEventListener('scroll', measure, { capture: true, passive: true });
    const stopObserving = observeResize(panel.current ? [outer, host, panel.current] : [outer, host], measure);
    return () => {
      doc.removeEventListener('scroll', measure, { capture: true });
      stopObserving();
    };
  }, [tray, field, panel, openId, layoutKey]);

  return places;
}
