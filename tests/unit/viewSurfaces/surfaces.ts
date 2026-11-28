import type { ViewAtlasState } from '../../../src/app/storeFactory';
import type { PopoverObject, SurfaceView } from './surfaceView';

/** Every panel, popover and mode of the view that the store says is open. */
export const SURFACE_NAMES = [
  'gridSettings', 'dmScreen', 'gridAlignment', 'floorPositioning', 'diceLog', 'hotkeyHelp', 'docs', 'assetManager',
  'palette', 'diceTray', 'lightPopover', 'zonePopover', 'stairsPopover', 'openingPopover', 'measurePopover',
  'toolbarEditing', 'dungeonGenerator', 'tableMode',
] as const;

export type SurfaceName = typeof SURFACE_NAMES[number];

export interface SurfaceCase {
  open: (view: SurfaceView) => void;
  close: (view: SurfaceView) => void;
  isOpen: (state: ViewAtlasState) => boolean;
  /** The object it is open on. */
  object?: PopoverObject;
  /** The tool it is opened with, where it needs one. */
  tool?: ViewAtlasState['activeTool'];
}

const flag = (
  key: keyof ViewAtlasState,
  set: (state: ViewAtlasState, open: boolean) => void,
): SurfaceCase => ({
  open: (view) => set(view.state(), true),
  close: (view) => set(view.state(), false),
  isOpen: (state) => state[key] === true,
});

const popover = (
  key: 'lightPopover' | 'lightZonePopover' | 'levelLinkPopover' | 'levelSurfacePopover' | 'measurePopover',
  object: PopoverObject,
  open: (state: ViewAtlasState, id: string) => void,
  close: (state: ViewAtlasState) => void,
  tool?: ViewAtlasState['activeTool'],
): SurfaceCase => ({
  open: (view) => open(view.state(), view.ids[object]),
  close: (view) => close(view.state()),
  isOpen: (state) => state[key] !== null,
  object,
  ...(tool && { tool }),
});

export const SURFACES: Readonly<Record<SurfaceName, SurfaceCase>> = {
  gridSettings: flag('isGridSettingsOpen', (s, open) => s.setGridSettingsOpen(open)),
  dmScreen: flag('isDMScreenOpen', (s, open) => s.setDMScreenOpen(open)),
  gridAlignment: flag('isGridAlignmentOpen', (s, open) => s.setGridAlignmentOpen(open)),
  floorPositioning: flag('isFloorPositioning', (s, open) => s.setFloorPositioning(open)),
  diceLog: flag('isDiceLogOpen', (s, open) => s.setDiceLogOpen(open)),
  hotkeyHelp: flag('isHotkeyHelpOpen', (s, open) => s.setHotkeyHelpOpen(open)),
  docs: flag('isDocsOpen', (s, open) => s.setDocsOpen(open)),
  assetManager: flag('isAssetManagerOpen', (s, open) => (open ? s.openAssetManager() : s.closeAssetManager())),
  palette: flag('isCommandPaletteOpen', (s, open) => s.setCommandPaletteOpen(open)),
  diceTray: flag('isDiceTrayOpen', (s, open) => s.setDiceTrayOpen(open)),
  lightPopover: popover('lightPopover', 'light', (s, id) => s.openLightPopover(id), (s) => s.closeLightPopover()),
  zonePopover: popover('lightZonePopover', 'zone', (s, id) => s.openLightZonePopover(id), (s) => s.closeLightZonePopover(), 'wall'),
  stairsPopover: popover('levelLinkPopover', 'link', (s, id) => s.openLevelLinkPopover(id), (s) => s.closeLevelLinkPopover(), 'stairs'),
  openingPopover: popover('levelSurfacePopover', 'surface', (s, id) => s.openLevelSurfacePopover(id), (s) => s.closeLevelSurfacePopover(), 'wall'),
  measurePopover: popover('measurePopover', 'measure', (s, id) => s.openMeasurePopover(id), (s) => s.closeMeasurePopover()),
  toolbarEditing: flag('isToolbarEditing', (s, open) => s.setToolbarEditing(open)),
  dungeonGenerator: {
    open: (view) => view.state().openDungeonGenerator({ id: 1, collectionId: 'heist', name: 'Crypt' }),
    close: (view) => view.state().closeDungeonGenerator(1),
    isOpen: (state) => state.dungeonGenerator !== null,
  },
  tableMode: {
    open: (view) => view.state().enterTableMode(),
    close: (view) => view.state().leaveTableMode(),
    isOpen: (state) => state.tableMode !== null,
  },
};

/** Which surfaces are open, by name. */
export function openSurfaces(state: ViewAtlasState): SurfaceName[] {
  return SURFACE_NAMES.filter((name) => SURFACES[name].isOpen(state));
}
