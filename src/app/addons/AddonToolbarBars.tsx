import React from 'react';
import { installedAddons } from './addonRegistry';

/** The bars add-ons show above the bottom toolbar, or null when there are none. */
export function AddonToolbarBars(): React.ReactElement | null {
  const bars = installedAddons().flatMap((addon) => (addon.ToolbarAbove ? [{ id: addon.id, Bar: addon.ToolbarAbove }] : []));
  if (bars.length === 0) return null;
  return <>{bars.map(({ id, Bar }) => <Bar key={id} />)}</>;
}

export function hasAddonToolbarBars(): boolean {
  return installedAddons().some((addon) => addon.ToolbarAbove);
}

/** The layers add-ons put over the map, or null when there are none. */
export function AddonMapOverlays(): React.ReactElement | null {
  const overlays = installedAddons().flatMap((addon) => (addon.MapOverlay ? [{ id: addon.id, Overlay: addon.MapOverlay }] : []));
  if (overlays.length === 0) return null;
  return <>{overlays.map(({ id, Overlay }) => <Overlay key={id} />)}</>;
}
