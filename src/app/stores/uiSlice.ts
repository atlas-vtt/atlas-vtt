/**
 * UI Visibility State Slice
 * Manages ephemeral per-view UI panel visibility so that multiple Atlas views
 * (e.g. two maps side-by-side) have independent panel states.
 *
 * NOT persisted — the partialize whitelist in storeFactory.ts excludes these.
 */

import { DEFAULT_DRAW_TOOL, type DrawToolChoices } from '../annotations/annotationTypes';
import { sameRememberedDrawTool } from '../annotations/drawToolMemory';
import { DEFAULT_FOG_TOOL, settledFogTool, type FogToolChoices } from '../fog/fogToolChoices';
import { DEFAULT_EXPLORED_BRUSH, type ExploredBrushOptions } from '../lighting/exploredEdits';
import { DEFAULT_LIGHTING_TOOL, type LightingToolOptions } from '../lighting/lightingTool';
import { DEFAULT_MEASURE_TOOL, type MeasureToolOptions } from '../measure/measureTypes';
import type { DMScreenPage, DungeonGeneratorRequest, HeldTokens, ViewUIState } from '../types/viewUIState';

/** State fields added to ViewAtlasState */
export interface UISlice extends ViewUIState {

  // Actions
  setGridSettingsOpen: (open: boolean) => void;
  setDMScreenOpen: (open: boolean) => void;
  setDMScreenPage: (page: DMScreenPage) => void;
  setGridAlignmentOpen: (open: boolean) => void;
  setDiceLogOpen: (open: boolean) => void;
  openAssetManager: (tab?: UISlice['assetManagerInitialTab']) => void;
  closeAssetManager: () => void;
  /** Opens or closes the palette; `page` names the page it opens on. */
  setCommandPaletteOpen: (open: boolean, page?: string) => void;
  setDiceTrayOpen: (open: boolean) => void;
  openLightPopover: (lightId: string) => void;
  closeLightPopover: () => void;
  openLightZonePopover: (zoneId: string) => void;
  closeLightZonePopover: () => void;
  openLevelLinkPopover: (linkId: string) => void;
  closeLevelLinkPopover: () => void;
  openLevelSurfacePopover: (surfaceId: string) => void;
  closeLevelSurfacePopover: () => void;
  openMeasurePopover: (measureId: string) => void;
  closeMeasurePopover: () => void;
  openFogAreaPopover: (areaId: string) => void;
  closeFogAreaPopover: () => void;
  /** Selects a fog area for editing in the fog tool's Areas mode, or none (null). */
  selectFogArea: (areaId: string | null) => void;
  setMeasureTool: (changes: Partial<MeasureToolOptions>) => void;
  /** Changes the Draw tool's choices; a change of its style is remembered on the device. */
  setDrawTool: (changes: Partial<DrawToolChoices>) => void;
  /** Changes the fog tool's choices; a brush size is kept within its limits, and Areas never has the brush (`settledFogTool`). */
  setFogTool: (changes: Partial<FogToolChoices>) => void;
  setLightingTool: (changes: Partial<LightingToolOptions>) => void;
  setHeldTokens: (held: HeldTokens) => void;
  setExploredBrush: (changes: Partial<ExploredBrushOptions>) => void;
  /** Starting the toolbar editor closes the dice tray, which hangs where the tray goes. */
  setToolbarEditing: (on: boolean) => void;
  /** Opens the dungeon generator over the map, in place of one open already. */
  openDungeonGenerator: (request: DungeonGeneratorRequest) => void;
  /** Closes the generator opening `id`; one opened since stays. */
  closeDungeonGenerator: (id: number) => void;
  setRoofsHidden: (hidden: boolean) => void;
}

/** Default state — all panels closed. `drawTool` is what the Draw tool starts with: its defaults, or what the device remembered. */
export function createInitialUIState(drawTool: DrawToolChoices = DEFAULT_DRAW_TOOL): Pick<
  UISlice,
  | 'isGridSettingsOpen'
  | 'isDMScreenOpen'
  | 'dmScreenPage'
  | 'isGridAlignmentOpen'
  | 'isDiceLogOpen'
  | 'isAssetManagerOpen'
  | 'assetManagerInitialTab'
  | 'isCommandPaletteOpen'
  | 'commandPalettePage'
  | 'isDiceTrayOpen'
  | 'lightPopover'
  | 'lightZonePopover'
  | 'levelLinkPopover'
  | 'levelSurfacePopover'
  | 'measurePopover'
  | 'fogAreaPopover'
  | 'fogAreaSelected'
  | 'measureTool'
  | 'drawTool'
  | 'fogTool'
  | 'lightingTool'
  | 'heldTokens'
  | 'exploredBrush'
  | 'isToolbarEditing'
  | 'dungeonGenerator'
  | 'roofsHidden'
> {
  return {
    isGridSettingsOpen: false,
    isDMScreenOpen: false,
    dmScreenPage: 'statblocks',
    isGridAlignmentOpen: false,
    isDiceLogOpen: false,
    isAssetManagerOpen: false,
    assetManagerInitialTab: undefined,
    isCommandPaletteOpen: false,
    commandPalettePage: null,
    isDiceTrayOpen: false,
    lightPopover: null,
    lightZonePopover: null,
    levelLinkPopover: null,
    levelSurfacePopover: null,
    measurePopover: null,
    fogAreaPopover: null,
    fogAreaSelected: null,
    measureTool: DEFAULT_MEASURE_TOOL,
    drawTool,
    fogTool: DEFAULT_FOG_TOOL,
    lightingTool: DEFAULT_LIGHTING_TOOL,
    heldTokens: {},
    exploredBrush: DEFAULT_EXPLORED_BRUSH,
    isToolbarEditing: false,
    dungeonGenerator: null,
    roofsHidden: false,
  };
}

/**
 * Action creators — `set` comes from the immer middleware in the store. `rememberDrawTool` is
 * handed the Draw tool's choices whenever their style changed, to keep them for the device.
 */
export function createUIActions(
  set: (fn: (draft: UISlice) => void) => void,
  rememberDrawTool?: (choices: DrawToolChoices) => void,
): Pick<
  UISlice,
  | 'setGridSettingsOpen'
  | 'setDMScreenOpen'
  | 'setDMScreenPage'
  | 'setGridAlignmentOpen'
  | 'setDiceLogOpen'
  | 'openAssetManager'
  | 'closeAssetManager'
  | 'setCommandPaletteOpen'
  | 'setDiceTrayOpen'
  | 'openLightPopover'
  | 'closeLightPopover'
  | 'openLightZonePopover'
  | 'closeLightZonePopover'
  | 'openLevelLinkPopover'
  | 'closeLevelLinkPopover'
  | 'openLevelSurfacePopover'
  | 'closeLevelSurfacePopover'
  | 'openMeasurePopover'
  | 'closeMeasurePopover'
  | 'openFogAreaPopover'
  | 'closeFogAreaPopover'
  | 'selectFogArea'
  | 'setMeasureTool'
  | 'setDrawTool'
  | 'setFogTool'
  | 'setLightingTool'
  | 'setHeldTokens'
  | 'setExploredBrush'
  | 'setToolbarEditing'
  | 'openDungeonGenerator'
  | 'closeDungeonGenerator'
  | 'setRoofsHidden'
> {
  return {
    setGridSettingsOpen: (open) => set((draft) => { draft.isGridSettingsOpen = open; }),
    setDMScreenOpen: (open) => set((draft) => { draft.isDMScreenOpen = open; }),
    setDMScreenPage: (page) => set((draft) => { draft.dmScreenPage = page; }),
    setGridAlignmentOpen: (open) => set((draft) => { draft.isGridAlignmentOpen = open; }),
    setDiceLogOpen: (open) => set((draft) => { draft.isDiceLogOpen = open; }),
    // The palette, the dice tray and the asset manager open where the toolbar editor's tray sits, or over the map: each ends edit mode.
    openAssetManager: (tab) => set((draft) => {
      draft.isAssetManagerOpen = true;
      draft.assetManagerInitialTab = tab;
      draft.isToolbarEditing = false;
    }),
    closeAssetManager: () => set((draft) => {
      draft.isAssetManagerOpen = false;
      draft.assetManagerInitialTab = undefined;
    }),
    setCommandPaletteOpen: (open, page) => set((draft) => {
      draft.isCommandPaletteOpen = open;
      draft.commandPalettePage = open ? page ?? null : null;
      if (open) draft.isToolbarEditing = false;
    }),
    setDiceTrayOpen: (open) => set((draft) => {
      draft.isDiceTrayOpen = open;
      if (open) draft.isToolbarEditing = false;
    }),
    openLightPopover: (lightId) => set((draft) => {
      draft.lightPopover = lightId;
      draft.lightZonePopover = null;
      draft.measurePopover = null;
    }),
    openLightZonePopover: (zoneId) => set((draft) => {
      draft.lightZonePopover = zoneId;
      draft.lightPopover = null;
      draft.measurePopover = null;
    }),
    closeLightZonePopover: () => set((draft) => { draft.lightZonePopover = null; }),
    openLevelLinkPopover: (linkId) => set((draft) => { draft.levelLinkPopover = linkId; }),
    closeLevelLinkPopover: () => set((draft) => { draft.levelLinkPopover = null; }),
    openLevelSurfacePopover: (surfaceId) => set((draft) => { draft.levelSurfacePopover = surfaceId; }),
    closeLevelSurfacePopover: () => set((draft) => { draft.levelSurfacePopover = null; }),
    closeLightPopover: () => set((draft) => { draft.lightPopover = null; }),
    openMeasurePopover: (measureId) => set((draft) => {
      draft.measurePopover = measureId;
      draft.lightPopover = null;
      draft.lightZonePopover = null;
    }),
    closeMeasurePopover: () => set((draft) => { draft.measurePopover = null; }),
    openFogAreaPopover: (areaId) => set((draft) => { draft.fogAreaPopover = areaId; }),
    closeFogAreaPopover: () => set((draft) => { draft.fogAreaPopover = null; }),
    selectFogArea: (areaId) => set((draft) => { draft.fogAreaSelected = areaId; }),
    setMeasureTool: (changes) => set((draft) => { draft.measureTool = { ...draft.measureTool, ...changes }; }),
    setDrawTool: (changes) => {
      let styled: DrawToolChoices | null = null;
      set((draft) => {
        const next = { ...draft.drawTool, ...changes };
        if (!sameRememberedDrawTool(draft.drawTool, next)) styled = next;
        draft.drawTool = next;
      });
      if (styled) rememberDrawTool?.(styled);
    },
    setFogTool: (changes) => set((draft) => {
      draft.fogTool = settledFogTool({ ...draft.fogTool, ...changes });
    }),
    setLightingTool: (changes) => set((draft) => { draft.lightingTool = { ...draft.lightingTool, ...changes }; }),
    setHeldTokens: (held) => set((draft) => { draft.heldTokens = held; }),
    setExploredBrush: (changes) => set((draft) => { draft.exploredBrush = { ...draft.exploredBrush, ...changes }; }),
    setToolbarEditing: (on) => set((draft) => {
      draft.isToolbarEditing = on;
      if (on) draft.isDiceTrayOpen = false;
    }),
    openDungeonGenerator: (request) => set((draft) => {
      draft.dungeonGenerator = request;
      draft.isToolbarEditing = false;
    }),
    closeDungeonGenerator: (id) => set((draft) => {
      if (draft.dungeonGenerator?.id === id) draft.dungeonGenerator = null;
    }),
    setRoofsHidden: (hidden) => set((draft) => { draft.roofsHidden = hidden; }),
  };
}
