import type { ExploredBrushOptions } from '../lighting/exploredEdits';
import type { Point } from './visionTypes';

/** The tokens held at their starting positions. */
export type HeldTokens = Readonly<Record<string, Point>>;

/** The dungeon generator as it was opened over the map. */
export interface DungeonGeneratorRequest {
  /** One per opening: each is a dungeon of its own. */
  id: number;
  /** The collection the scene goes to, to begin with. */
  collectionId: string;
  /** The scene's name to begin with. */
  name: string;
  /** Where the note pin dropdown it takes over stood, in the window's pixels: the wizard opens in its place. */
  anchor?: { left: number; top: number; width: number; height: number };
}

export interface ViewUIState {

  // Panel visibility
  isGridSettingsOpen: boolean;
  isDMScreenOpen: boolean;
  isGridAlignmentOpen: boolean;
  isDiceLogOpen: boolean;
  isAssetManagerOpen: boolean;
  assetManagerInitialTab?: 'scenes' | 'maps' | 'encounters' | 'tokens' | 'party' | undefined;
  isCommandPaletteOpen: boolean;
  /** The page the palette opens on when it opens next (a menu's "Graphics settings…" row); taken when it opens. */
  commandPalettePage: string | null;
  isDiceTrayOpen: boolean;
  /** The placed light whose popover is open, with its range rings on the map. */
  lightPopover: string | null;
  /** The light zone whose popover is open; never together with a light's. */
  lightZonePopover: string | null;
  /** The stairs (level link) whose popover is open. */
  levelLinkPopover: string | null;
  /** The opening or floor (level surface) whose popover is open. */
  levelSurfacePopover: string | null;
  /** The scene lighting settings panel, opened from the lighting tool's menu. */
  isSceneLightingPanelOpen: boolean;
  /** The tokens the pointer holds (pressed or dragged), each where it stood when taken; set through `holdTokens`. */
  heldTokens: HeldTokens;
  /** What the lighting tool's explored-memory mode does with a stroke: the one place the menu and the tool read it from. */
  exploredBrush: ExploredBrushOptions;
  /**
   * The level of the scene this view shows (`viewedLevelId` reads it): unset, or one the scene
   * does not have, is the first. Kept with the tab's camera, never with the scene, and never an undo step.
   */
  viewedLevel?: string | null | undefined;
  /** The toolbar editor is open in this view: tray, hide and show, inert tools. Never saved. */
  isToolbarEditing: boolean;
  /** The dungeon generator, filling the view while it is open. */
  dungeonGenerator: DungeonGeneratorRequest | null;
  /** The GM hides the roofs of the GM's own picture in this view (the switcher's Roofs); players still see theirs. Never saved. */
  roofsHidden: boolean;
}
