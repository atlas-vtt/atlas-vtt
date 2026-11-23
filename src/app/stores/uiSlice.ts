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
import { DEFAULT_TOOL_SWITCHES, type ToolSwitchId } from '../types/toolSwitches';
import type { DMScreenPage, DungeonGeneratorRequest, HeldTokens, ViewUIState } from '../types/viewUIState';

/** State fields added to ViewAtlasState */
export interface UISlice extends ViewUIState {

  // Actions
  setGridSettingsOpen: (open: boolean) => void;
  setDMScreenOpen: (open: boolean) => void;
  setDMScreenPage: (page: DMScreenPage) => void;
  setGridAlignmentOpen: (open: boolean) => void;
  setFloorPositioning: (on: boolean) => void;
  setDiceLogOpen: (open: boolean) => void;
  /** `addsCombatants`: opening a token or an encounter there adds it to initiative beside the map. */
  openAssetManager: (tab?: UISlice['assetManagerInitialTab'], addsCombatants?: boolean) => void;
  setHotkeyHelpOpen: (open: boolean) => void;
  setDocsOpen: (open: boolean) => void;
  /** Opens the asset manager on the Armarium, or shows the Armarium in it while it is open. */
  openArmarium: () => void;
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
  setMeasureTool: (changes: Partial<MeasureToolOptions>) => void;
  /** Changes the Draw tool's choices; a change of its style is remembered on the device. */
  setDrawTool: (changes: Partial<DrawToolChoices>) => void;
  /** Changes the fog tool's choices; a brush size is kept within its limits (`settledFogTool`). */
  setFogTool: (changes: Partial<FogToolChoices>) => void;
  setLightingTool: (changes: Partial<LightingToolOptions>) => void;
  /** Sets one of the tools' switches that stand for a held key. */
  setToolSwitch: (id: ToolSwitchId, on: boolean) => void;
  setHeldTokens: (held: HeldTokens) => void;
  setExploredBrush: (changes: Partial<ExploredBrushOptions>) => void;
  /** Starting the toolbar editor closes the dice tray, which hangs where the tray goes. */
  setToolbarEditing: (on: boolean) => void;
  /** Opens the dungeon generator over the map, in place of one open already. */
  openDungeonGenerator: (request: DungeonGeneratorRequest) => void;
  /** Closes the generator opening `id`; one opened since stays. */
  closeDungeonGenerator: (id: number) => void;
  setRoofsHidden: (hidden: boolean) => void;
  setSelectMore: (on: boolean) => void;
}

/** Default state — all panels closed. `drawTool` is what the Draw tool starts with: its defaults, or what the device remembered. */
export function createInitialUIState(drawTool: DrawToolChoices = DEFAULT_DRAW_TOOL): Pick<
  UISlice,
  | 'isGridSettingsOpen'
  | 'isDMScreenOpen'
  | 'dmScreenPage'
  | 'isGridAlignmentOpen'
  | 'isFloorPositioning'
  | 'isDiceLogOpen'
  | 'isHotkeyHelpOpen'
  | 'isDocsOpen'
  | 'isAssetManagerOpen'
  | 'assetManagerInitialTab'
  | 'assetManagerAddsCombatants'
  | 'assetManagerArmarium'
  | 'isCommandPaletteOpen'
  | 'commandPalettePage'
  | 'isDiceTrayOpen'
  | 'lightPopover'
  | 'lightZonePopover'
  | 'levelLinkPopover'
  | 'levelSurfacePopover'
  | 'measurePopover'
  | 'measureTool'
  | 'drawTool'
  | 'fogTool'
  | 'lightingTool'
  | 'toolSwitches'
  | 'heldTokens'
  | 'exploredBrush'
  | 'isToolbarEditing'
  | 'dungeonGenerator'
  | 'roofsHidden'
  | 'selectMore'
> {
  return {
    isGridSettingsOpen: false,
    isDMScreenOpen: false,
    dmScreenPage: 'statblocks',
    isGridAlignmentOpen: false,
    isFloorPositioning: false,
    isDiceLogOpen: false,
    isHotkeyHelpOpen: false,
    isDocsOpen: false,
    isAssetManagerOpen: false,
    assetManagerInitialTab: undefined,
    assetManagerAddsCombatants: false,
    assetManagerArmarium: 0,
    isCommandPaletteOpen: false,
    commandPalettePage: null,
    isDiceTrayOpen: false,
    lightPopover: null,
    lightZonePopover: null,
    levelLinkPopover: null,
    levelSurfacePopover: null,
    measurePopover: null,
    measureTool: DEFAULT_MEASURE_TOOL,
    drawTool,
    fogTool: DEFAULT_FOG_TOOL,
    lightingTool: DEFAULT_LIGHTING_TOOL,
    toolSwitches: DEFAULT_TOOL_SWITCHES,
    heldTokens: {},
    exploredBrush: DEFAULT_EXPLORED_BRUSH,
    isToolbarEditing: false,
    dungeonGenerator: null,
    roofsHidden: false,
    selectMore: false,
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
  | 'setFloorPositioning'
  | 'setDiceLogOpen'
  | 'setHotkeyHelpOpen'
  | 'setDocsOpen'
  | 'openAssetManager'
  | 'openArmarium'
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
  | 'setMeasureTool'
  | 'setDrawTool'
  | 'setFogTool'
  | 'setLightingTool'
  | 'setToolSwitch'
  | 'setHeldTokens'
  | 'setExploredBrush'
  | 'setToolbarEditing'
  | 'openDungeonGenerator'
  | 'closeDungeonGenerator'
  | 'setRoofsHidden'
  | 'setSelectMore'
> {
  return {
    setGridSettingsOpen: (open) => set((draft) => { draft.isGridSettingsOpen = open; }),
    setDMScreenOpen: (open) => set((draft) => { draft.isDMScreenOpen = open; }),
    setDMScreenPage: (page) => set((draft) => { draft.dmScreenPage = page; }),
    setGridAlignmentOpen: (open) => set((draft) => { draft.isGridAlignmentOpen = open; }),
    setFloorPositioning: (on) => set((draft) => { draft.isFloorPositioning = on; }),
    setDiceLogOpen: (open) => set((draft) => { draft.isDiceLogOpen = open; }),
    setHotkeyHelpOpen: (open) => set((draft) => { draft.isHotkeyHelpOpen = open; }),
    setDocsOpen: (open) => set((draft) => { draft.isDocsOpen = open; }),
    // The palette, the dice tray and the asset manager open where the toolbar editor's tray sits, or over the map: each ends edit mode.
    openAssetManager: (tab, addsCombatants = false) => set((draft) => {
      draft.isAssetManagerOpen = true;
      draft.assetManagerInitialTab = tab;
      draft.assetManagerAddsCombatants = addsCombatants;
      draft.isToolbarEditing = false;
    }),
    openArmarium: () => set((draft) => {
      draft.isAssetManagerOpen = true;
      draft.assetManagerArmarium += 1;
      draft.isToolbarEditing = false;
    }),
    closeAssetManager: () => set((draft) => {
      draft.isAssetManagerOpen = false;
      draft.assetManagerInitialTab = undefined;
      draft.assetManagerAddsCombatants = false;
      draft.assetManagerArmarium = 0;
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
    setToolSwitch: (id, on) => set((draft) => { draft.toolSwitches = { ...draft.toolSwitches, [id]: on }; }),
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
    setSelectMore: (on) => set((draft) => { draft.selectMore = on; }),
  };
}
