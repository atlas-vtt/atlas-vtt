import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { ViewAtlasStore } from '../../storeFactory';
import type { AnyWidget, WidgetSettings } from '../../types/widgetTypes';
import { isWidgetOn } from '../../utils/widgetActivation';
import { playTurnMotion, snapshotTurn, type TurnSnapshot } from '../../initiative/motion/turnMotion';
import type { Outward } from '../../initiative/motion/listPresence';
import { useListPresence } from './useInitiativeMotion';

/** The map's widgets stand at its top right corner: they come down from the top edge and go back up. */
const OUTWARD: Outward = [0, -1];

/** The widgets a bar lists, in their order: those on in the scene, and in a player view those players see. */
export function listedWidgets(settings: WidgetSettings | undefined, isPlayerView: boolean): AnyWidget[] {
  return Object.values<AnyWidget>(settings?.widgets ?? {})
    .filter((widget) => isWidgetOn(settings, widget) && (!isPlayerView || widget.visibleToPlayers))
    .sort((a, b) => a.order - b.order);
}

function orderOf(widgets: readonly AnyWidget[]): string {
  return widgets.map((widget) => widget.id).join();
}

/** `widgets`, or while none are left the ones listed last: a bar whose last widget went leaves with it on show. */
export function useHeldWidgets(widgets: AnyWidget[]): AnyWidget[] {
  const last = useRef(widgets);
  if (widgets.length > 0) last.current = widgets;
  return widgets.length > 0 ? widgets : last.current;
}

interface BarMotionTarget {
  bar: HTMLElement | null;
  /** Whether the cards lie as they will (`useWidgetStack`): the motion waits for a row turned into a stack. */
  settled: () => boolean;
}

/**
 * How the map's widget bar moves, as the initiative lists do: shown or hidden as a whole (Show all widgets, the first
 * widget switched on or the last one off) it comes in from the top edge and leaves towards it (`useListPresence`); a
 * widget switched on, off or deleted, or moved to another place, makes the others glide to their new places while it
 * grows in or fades out where it stood (`playTurnMotion`, read from the bar's right edge, where it is anchored). A
 * scene loading changes it at once: what a load brings is no edit.
 */
export function useWidgetBarMotion(store: ViewAtlasStore, isPlayerView: boolean, shown: boolean, target: BarMotionTarget): { drawn: boolean; leaving: boolean } {
  const loading = useStore(store, (state) => state.isMapLoading);
  const presence = useListPresence(shown, target.bar, OUTWARD, loading);
  const bar = useRef(target.bar);
  bar.current = target.bar;
  const before = useRef<TurnSnapshot | null>(null);

  // Where the cards stood is read as the store changes, before React draws the new list
  useEffect(() => store.subscribe((state, previous) => {
    if (before.current || !bar.current || state.widgetSettings === previous.widgetSettings) return;
    if (state.isMapLoading || previous.isMapLoading) return;
    if (orderOf(listedWidgets(state.widgetSettings, isPlayerView)) === orderOf(listedWidgets(previous.widgetSettings, isPlayerView))) return;
    before.current = snapshotTurn(bar.current, { fromRight: true });
  }), [store, isPlayerView]);

  useLayoutEffect(() => {
    const snapshot = before.current;
    if (!snapshot || !target.settled()) return;
    before.current = null;
    if (shown && !presence.leaving) playTurnMotion(bar.current, snapshot, { fromRight: true, wrap: false });
  });

  return presence;
}
