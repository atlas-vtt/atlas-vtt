import { readLight } from '../../lighting/lightingObjects';
import type { ViewAtlasState } from '../../storeFactory';
import { lightMarkersShown } from './LightMarkers';
import { levelObjects } from '../../levels/levelObjects';

/** A light's popover needs the light, its marker on the map and the GM's view of a loaded scene. */
export function mayEditLight(state: ViewAtlasState, lightId: string): boolean {
  return !!readLight(levelObjects(state).lights[lightId]) && state.isGMView && !state.isMapLoading && lightMarkersShown(state);
}

/** A zone's popover needs the zone and the lighting tool in the GM's view of a loaded scene. */
export function mayEditZone(state: ViewAtlasState, zoneId: string): boolean {
  return !!levelObjects(state).lightZones?.[zoneId] && state.activeTool === 'wall' && state.isGMView && !state.isMapLoading;
}

/** An opening's popover needs the opening on the level shown and the lighting tool in the GM's view of a loaded scene. */
export function mayEditSurface(state: ViewAtlasState, surfaceId: string): boolean {
  return !!levelObjects(state).levelSurfaces?.[surfaceId] && state.activeTool === 'wall' && state.isGMView && !state.isMapLoading;
}

/**
 * Closes the popover of a light, zone or opening that can no longer be edited: deleted, taken away
 * by undo, on a level the view no longer shows, or the view no longer the GM's of a loaded scene.
 * Called on every store change.
 */
export function closeStalePopovers(state: ViewAtlasState): void {
  if (state.lightPopover && !mayEditLight(state, state.lightPopover)) state.closeLightPopover();
  if (state.lightZonePopover && !mayEditZone(state, state.lightZonePopover)) state.closeLightZonePopover();
  if (state.levelSurfacePopover && !mayEditSurface(state, state.levelSurfacePopover)) state.closeLevelSurfacePopover();
}
