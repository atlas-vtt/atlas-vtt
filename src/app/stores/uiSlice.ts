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
import { closedSurfaces, closeIn, openIn, setOpenIn } from './viewSurfaces';

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
  setToolbarEditing: (on: boolean) => void;
  /** Opens the dungeon generator over the map, in place of one open already. */
  openDungeonGenerator: (request: DungeonGeneratorRequest) => void;
  /** Closes the generator opening `id`; one opened since stays. */
  closeDungeonGenerator: (id: number) => void;
  setRoofsHidden: (hidden: boolean) => void;
  setSelectMore: (on: boolean) => void;
  /** The tracker names `entryId`'s conditions (`conditionsShownEntry`). */
  showCombatantConditions: (entryId: string) => void;
  /** It stops naming `entryId`'s; one opened since stays. */
  hideCombatantConditions: (entryId: string) => void;
}

/** What a view's state holds of the UI slice; `viewedLevel` is the levels' (`sceneLevelsSlice.ts`). */
type UIInitialState = Omit<ViewUIState, 'viewedLevel'>;

/** The slice's actions. */
export type UIActions = Omit<UISlice, keyof ViewUIState>;

/** Default state — every surface closed (`viewSurfaces.ts`). `drawTool` is what the Draw tool starts with: its defaults, or what the device remembered. */
export function createInitialUIState(drawTool: DrawToolChoices = DEFAULT_DRAW_TOOL): UIInitialState {
  return {
    ...closedSurfaces(),
    dmScreenPage: 'statblocks',
    measureTool: DEFAULT_MEASURE_TOOL,
    drawTool,
    fogTool: DEFAULT_FOG_TOOL,
    lightingTool: DEFAULT_LIGHTING_TOOL,
    toolSwitches: DEFAULT_TOOL_SWITCHES,
    heldTokens: {},
    exploredBrush: DEFAULT_EXPLORED_BRUSH,
    roofsHidden: false,
    selectMore: false,
    conditionsShownEntry: null,
  };
}

/**
 * Action creators — `set` comes from the immer middleware in the store. `rememberDrawTool` is
 * handed the Draw tool's choices whenever their style changed, to keep them for the device. What
 * opening or closing a surface does besides is its row's (`viewSurfaces.ts`).
 */
export function createUIActions(
  set: (fn: (draft: UISlice) => void) => void,
  rememberDrawTool?: (choices: DrawToolChoices) => void,
): UIActions {
  return {
    setGridSettingsOpen: (open) => set((draft) => setOpenIn(draft, 'isGridSettingsOpen', open)),
    setDMScreenOpen: (open) => set((draft) => setOpenIn(draft, 'isDMScreenOpen', open)),
    setDMScreenPage: (page) => set((draft) => { draft.dmScreenPage = page; }),
    setGridAlignmentOpen: (open) => set((draft) => setOpenIn(draft, 'isGridAlignmentOpen', open)),
    setFloorPositioning: (on) => set((draft) => setOpenIn(draft, 'isFloorPositioning', on)),
    setDiceLogOpen: (open) => set((draft) => setOpenIn(draft, 'isDiceLogOpen', open)),
    setHotkeyHelpOpen: (open) => set((draft) => setOpenIn(draft, 'isHotkeyHelpOpen', open)),
    setDocsOpen: (open) => set((draft) => setOpenIn(draft, 'isDocsOpen', open)),
    openAssetManager: (tab, addsCombatants = false) => set((draft) => {
      openIn(draft, 'isAssetManagerOpen', true);
      draft.assetManagerInitialTab = tab;
      draft.assetManagerAddsCombatants = addsCombatants;
    }),
    openArmarium: () => set((draft) => {
      openIn(draft, 'isAssetManagerOpen', true);
      draft.assetManagerArmarium += 1;
    }),
    closeAssetManager: () => set((draft) => closeIn(draft, 'isAssetManagerOpen')),
    setCommandPaletteOpen: (open, page) => set((draft) => {
      setOpenIn(draft, 'isCommandPaletteOpen', open);
      if (open) draft.commandPalettePage = page ?? null;
    }),
    setDiceTrayOpen: (open) => set((draft) => setOpenIn(draft, 'isDiceTrayOpen', open)),
    openLightPopover: (lightId) => set((draft) => openIn(draft, 'lightPopover', lightId)),
    closeLightPopover: () => set((draft) => closeIn(draft, 'lightPopover')),
    openLightZonePopover: (zoneId) => set((draft) => openIn(draft, 'lightZonePopover', zoneId)),
    closeLightZonePopover: () => set((draft) => closeIn(draft, 'lightZonePopover')),
    openLevelLinkPopover: (linkId) => set((draft) => openIn(draft, 'levelLinkPopover', linkId)),
    closeLevelLinkPopover: () => set((draft) => closeIn(draft, 'levelLinkPopover')),
    openLevelSurfacePopover: (surfaceId) => set((draft) => openIn(draft, 'levelSurfacePopover', surfaceId)),
    closeLevelSurfacePopover: () => set((draft) => closeIn(draft, 'levelSurfacePopover')),
    openMeasurePopover: (measureId) => set((draft) => openIn(draft, 'measurePopover', measureId)),
    closeMeasurePopover: () => set((draft) => closeIn(draft, 'measurePopover')),
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
    setToolbarEditing: (on) => set((draft) => setOpenIn(draft, 'isToolbarEditing', on)),
    openDungeonGenerator: (request) => set((draft) => openIn(draft, 'dungeonGenerator', request)),
    closeDungeonGenerator: (id) => set((draft) => {
      if (draft.dungeonGenerator?.id === id) closeIn(draft, 'dungeonGenerator');
    }),
    setRoofsHidden: (hidden) => set((draft) => { draft.roofsHidden = hidden; }),
    setSelectMore: (on) => set((draft) => { draft.selectMore = on; }),
    showCombatantConditions: (entryId) => set((draft) => { draft.conditionsShownEntry = entryId; }),
    hideCombatantConditions: (entryId) => set((draft) => {
      if (draft.conditionsShownEntry === entryId) draft.conditionsShownEntry = null;
    }),
  };
}
