import { readLight } from '../../lighting/lightingObjects';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { beamOf } from '../../lighting/lightBeam';
import { gameUnitsToWorld, unitScaleOf } from '../../lighting/lightingUnits';
import { useViewStoreHook } from '../../react/ViewStoreContext';
import { useAtlasUI } from '../../react/root/AtlasUIContext';
import { MOTION_EASE_OUT, MOTION_SLOW_MS, prefersReducedMotion } from '../../utils/motion';
import { observeResize } from '../../utils/observeResize';
import { mapMarkerScale } from '../utils/mapMarkerScale';
import { LIGHT_MARKER_RADIUS } from './lightMarker';
import { placeLightPopover, type PopoverChoice } from './lightPopoverPlacement';
import { ZONE_HANDLE_RADIUS } from './lightZoneGeometry';
import { zoneHandlePoint } from '../../lighting/lightZones';
import type { ViewAtlasState } from '../../storeFactory';
import { ringHandlePoints } from './lightRingGeometry';
import type { VisionCone } from '../../vision/visionCone';

/** Between the marker's edge, or the bright ring, and the popover. */
const GAP = 12;
/** The bars of the map view the popover keeps clear of: scene tabs above, the toolbars and the toolbar editor's tray below. */
const TOP_BARS = '.atlas-scene-tab-bar';
const BOTTOM_BARS = '.atlas-bottom-toolbar-row .atlas-vtt-toolbar, .atlas-bottom-toolbar-row .atlas-toolbar-tray';

interface Frame {
  /** The canvas within the area the popover is placed in. */
  x: number;
  y: number;
  area: { width: number; height: number };
  inset: { top: number; bottom: number };
  size: { width: number; height: number };
}

/** What a popover on the map is placed at, in world pixels: a light with its rings, or a point. */
export interface MapPopoverTarget {
  x: number;
  y: number;
  /** The radii of its rings; 0 for what has none. */
  bright: number;
  dim: number;
  beam?: VisionCone | undefined;
  /** Radius on screen of the marker the popover stands beside. */
  marker: number;
}

/** Reads the target `id` from the store at viewport `zoom`; null when it is gone. */
type ReadTarget = (state: ViewAtlasState, id: string, zoom: number) => MapPopoverTarget | null;

/** The popover of the light `lightId`. `unitDistance` is the game units a grid cell spans. */
export function useLightPopoverPosition(ref: React.RefObject<HTMLElement | null>, lightId: string, unitDistance: number): () => void {
  return useMapPopoverPosition(ref, lightId, (state, id, zoom) => {
    const light = readLight(state.objects.lights[id]);
    if (!light) return null;
    const scale = unitScaleOf({ unitDistance }, state.grid);
    return {
      x: light.x, y: light.y, beam: beamOf(light), marker: LIGHT_MARKER_RADIUS * mapMarkerScale(zoom) * zoom,
      bright: gameUnitsToWorld(light.emission.bright, scale), dim: gameUnitsToWorld(light.emission.dim, scale),
    };
  });
}

/** The popover of the light zone `zoneId`, beside the zone's handle. */
export function useZonePopoverPosition(ref: React.RefObject<HTMLElement | null>, zoneId: string): void {
  useMapPopoverPosition(ref, zoneId, (state, id) => {
    const zone = state.objects.lightZones?.[id];
    return zone ? { ...zoneHandlePoint(zone.polygon), bright: 0, dim: 0, marker: ZONE_HANDLE_RADIUS } : null;
  });
}

/**
 * Keeps the popover in `ref` at its light on the map (`placeLightPopover`): beyond the bright
 * ring where there is room, clear of the ring handles and of the map view's bars. It is placed
 * with `translate` on the map's own frame clock, so it follows pan, zoom and a dragged light in
 * the frame the canvas shows them, and its `transform-origin` is the light, which it grows out
 * of. The ring and the beam it keeps clear of are those it found when it took its place: tuning
 * or turning the light does not move the popover under the pointer. The function it returns is
 * for when the beam's width or direction was set and let go: the popover then makes way if the
 * beam's handles came to lie under it. When `id` changes, the same popover travels to the
 * other target. `read` says where the target is and how far its rings reach.
 */
function useMapPopoverPosition(ref: React.RefObject<HTMLElement | null>, id: string, read: ReadTarget): () => void {
  const store = useViewStoreHook();
  const { renderer, pixiApp } = useAtlasUI();
  const target = useRef(id);
  const reader = useRef(read);
  reader.current = read;
  /** Places the popover: 'anew' on the best side for the light as it is now, 'beam' where it is unless the beam's handles now lie under it. */
  const place = useRef<((how?: 'anew' | 'beam') => void) | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const container = element?.offsetParent;
    const viewport = renderer?.getViewportInstance();
    const canvas = renderer?.getCanvasElement();
    if (!element || !container || !viewport || !canvas) return undefined;
    const bars = [...container.querySelectorAll(`${TOP_BARS}, ${BOTTOM_BARS}`)];

    const measure = (): Frame => {
      const area = container.getBoundingClientRect();
      const map = canvas.getBoundingClientRect();
      const edges = (selector: string): DOMRect[] => [...container.querySelectorAll(selector)].map((bar) => bar.getBoundingClientRect()).filter((rect) => rect.height > 0);
      return {
        x: map.left - area.left,
        y: map.top - area.top,
        area: { width: area.width, height: area.height },
        inset: {
          top: Math.max(0, ...edges(TOP_BARS).map((rect) => rect.bottom - area.top)),
          bottom: Math.max(0, ...edges(BOTTOM_BARS).map((rect) => area.bottom - rect.top)),
        },
        size: { width: element.offsetWidth, height: element.offsetHeight },
      };
    };
    let frame = measure();
    let choice: PopoverChoice | null = null;
    /** World radius of the bright ring the popover keeps clear of. */
    let ring = 0;
    /** The beam whose handles it keeps clear of. */
    let beam: VisionCone | undefined;
    let placedFor = '';

    const update = (how?: 'anew' | 'beam'): void => {
      const anew = how === 'anew';
      // A light that is gone keeps the popover where it was while it leaves.
      const zoom = viewport.scale.x;
      const light = reader.current(store.getState(), target.current, zoom);
      if (!light) return;
      const at = viewport.toScreen(light.x, light.y);
      const { bright, dim } = light;
      const key = `${at.x},${at.y},${zoom},${bright},${dim}`;
      if (key === placedFor && !how) return;
      placedFor = key;
      if (anew || !choice) {
        choice = null;
        ring = bright;
        beam = light.beam;
      }
      // The beam was set and let go: it is the beam to keep clear of from now on.
      if (how === 'beam') beam = light.beam;
      const anchor = { x: frame.x + at.x, y: frame.y + at.y };
      const handlesOf = (cone: VisionCone | undefined): { x: number; y: number }[] =>
        ringHandlePoints({ center: anchor, radius: { bright: bright * zoom, dim: dim * zoom }, ...(cone && { cone }) }, 1);
      const input = {
        anchor,
        markerClearance: light.marker + GAP,
        bright: bright * zoom,
        size: frame.size,
        area: frame.area,
        inset: frame.inset,
      };
      let placement = placeLightPopover({ ...input, handles: handlesOf(beam), ringClearance: ring * zoom + GAP, current: choice });
      if (choice && !placement.kept) {
        // Its place no longer holds: it moves to the best one for the ring and the beam as they are now.
        ring = bright;
        beam = light.beam;
        placement = placeLightPopover({ ...input, handles: handlesOf(beam), ringClearance: ring * zoom + GAP, current: null });
      }
      choice = placement.choice;
      element.style.translate = `${placement.x}px ${placement.y}px`;
      element.style.transformOrigin = `${placement.origin.x}px ${placement.origin.y}px`;
    };
    const remeasure = (): void => {
      frame = measure();
      placedFor = '';
      update();
    };

    update();
    place.current = update;
    const tick = (): void => update();
    const ticker = pixiApp?.ticker;
    ticker?.add(tick);
    const stopObserving = observeResize([element, container, ...bars], remeasure);
    return () => {
      // A view that closes destroys its PIXI app, and with it this ticker, before the UI unmounts.
      if (ticker && pixiApp?.ticker === ticker) ticker.remove(tick);
      stopObserving();
      place.current = null;
    };
  }, [ref, renderer, pixiApp, store]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (target.current === id || !element) return;
    const from = element.style.translate;
    target.current = id;
    place.current?.('anew');
    const to = element.style.translate;
    if (!from || from === to || prefersReducedMotion(element)) return;
    element.animate([{ translate: from }, { translate: to }], { duration: MOTION_SLOW_MS, easing: MOTION_EASE_OUT });
  }, [id, ref]);

  return useCallback(() => place.current?.('beam'), []);
}
