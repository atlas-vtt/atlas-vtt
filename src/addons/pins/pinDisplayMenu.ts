import type { StoreApi } from 'zustand';
import type { NotePin } from 'src/app/types';
import type { ViewAtlasState } from 'src/app/storeFactory';
import type { ContextMenuEntry } from 'src/app/react/components/context-menu/AtlasContextMenu';
import { MAX_PIN_MAP_SCALE, MIN_PIN_MAP_SCALE, steppedMapScale, zoomLabel } from './pinDisplay';

/** How much one step of the size stepper grows or shrinks a pin. */
const SIZE_STEP = 1.2;

/**
 * A pin's context menu entries for who sees it, how it sizes with the map and
 * at which zoom levels it shows, plus the map-wide switches for the last two.
 * `zoom` is the current zoom and `screenScale` the world scale a pin has at it
 * without a map size, so locking a pin to the map keeps it the size it looks now.
 */
export function pinDisplayMenuEntries(
  store: StoreApi<ViewAtlasState>,
  pin: NotePin,
  zoom: number,
  screenScale: number,
): ContextMenuEntry[] {
  const update = (changes: Partial<NotePin>): void => store.getState().updateNotePin(pin.id, changes);
  const display = store.getState().pinDisplay;

  const sizeEntries: ContextMenuEntry[] = [
    {
      type: 'item',
      label: 'Grow and shrink with the map',
      checked: pin.mapScale !== undefined,
      onClick: () => update({ mapScale: pin.mapScale === undefined ? screenScale : undefined }),
    },
  ];
  if (pin.mapScale !== undefined) {
    const scale = pin.mapScale;
    sizeEntries.push(
      {
        type: 'item',
        label: 'Size on the map',
        keepOpen: true,
        onClick: () => {},
        stepper: {
          value: `${Math.round(scale * 100)}%`,
          label: 'Pin size on the map',
          onDecrement: () => update({ mapScale: steppedMapScale(scale, 1 / SIZE_STEP) }),
          onIncrement: () => update({ mapScale: steppedMapScale(scale, SIZE_STEP) }),
          canDecrement: scale > MIN_PIN_MAP_SCALE,
        },
      },
      { type: 'item', label: 'Use the size it has now', onClick: () => update({ mapScale: screenScale }) },
    );
  }
  if (pin.mapScale !== undefined && pin.mapScale >= MAX_PIN_MAP_SCALE) {
    sizeEntries.push({ type: 'item', label: 'Largest size reached', disabled: true, onClick: () => {} });
  }

  const focusEntries: ContextMenuEntry[] = [
    { type: 'item', label: `Range: ${focusRangeLabel(pin)}`, disabled: true, onClick: () => {} },
    {
      type: 'item',
      label: `Show only when zoomed in to ${zoomLabel(zoom)} or closer`,
      icon: 'zoom-in',
      onClick: () => update({ minZoom: zoom, ...(pin.maxZoom !== undefined && pin.maxZoom < zoom ? { maxZoom: undefined } : {}) }),
    },
    {
      type: 'item',
      label: `Hide when zoomed in closer than ${zoomLabel(zoom)}`,
      icon: 'zoom-out',
      onClick: () => update({ maxZoom: zoom, ...(pin.minZoom !== undefined && pin.minZoom > zoom ? { minZoom: undefined } : {}) }),
    },
    {
      type: 'item',
      label: 'Show at every zoom',
      disabled: pin.minZoom === undefined && pin.maxZoom === undefined,
      onClick: () => update({ minZoom: undefined, maxZoom: undefined }),
    },
  ];

  const mapEntries: ContextMenuEntry[] = [
    {
      type: 'item',
      label: 'Pins grow and shrink with the map',
      checked: display.scaleWithMap,
      keepOpen: true,
      onClick: () => store.getState().setPinDisplay({ scaleWithMap: !store.getState().pinDisplay.scaleWithMap }),
    },
    {
      type: 'item',
      label: 'Pins follow their focus range',
      checked: display.focusLevels,
      keepOpen: true,
      onClick: () => store.getState().setPinDisplay({ focusLevels: !store.getState().pinDisplay.focusLevels }),
    },
  ];

  return [
    {
      type: 'item',
      label: 'Show to players',
      icon: pin.playerVisible ? 'eye' : 'eye-off',
      checked: pin.playerVisible === true,
      onClick: () => update({ playerVisible: pin.playerVisible ? undefined : true }),
    },
    { type: 'submenu', label: 'Size', icon: 'scaling', children: sizeEntries },
    { type: 'submenu', label: 'Focus', icon: 'focus', children: focusEntries },
    { type: 'submenu', label: 'All pins on this map', icon: 'map-pin', children: mapEntries },
  ];
}

/** "35% to 200%", "from 35%", "up to 200%" or "any zoom". */
function focusRangeLabel(pin: NotePin): string {
  if (pin.minZoom !== undefined && pin.maxZoom !== undefined) return `${zoomLabel(pin.minZoom)} to ${zoomLabel(pin.maxZoom)}`;
  if (pin.minZoom !== undefined) return `from ${zoomLabel(pin.minZoom)} in`;
  if (pin.maxZoom !== undefined) return `up to ${zoomLabel(pin.maxZoom)}`;
  return 'any zoom';
}
