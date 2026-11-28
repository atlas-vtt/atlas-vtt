/**
 * The view's surfaces: the panels, popovers and modes its store says are open, and the bars above
 * the toolbar. One row each says what its closing writes (how a view starts it, too), what opening
 * it closes, whether a level switch closes it, and while what it may stay open. Setters open and
 * close through `openIn` and `closeIn`; `withSurfaces` closes on every write of the store what may
 * no longer stay open, in that write; bars ask `barShown`. Nothing else decides it.
 */

import type { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { toolSelects } from '../annotations/selectMore';
import { isFogTool } from '../fog/fogToolChoices';
import { levelLinkList, stairsShown } from '../levels/levelLinks';
import { levelObjects } from '../levels/levelObjects';
import { readLight } from '../lighting/lightingObjects';
import { lightMarkersShown } from '../lighting/lightingTool';
import { shownTool } from '../measure/heldRuler';
import { mayEditMeasure } from '../measure/keptMeasures';
import type { ViewAtlasState } from '../storeFactory';

export type Surface =
  | 'isGridSettingsOpen' | 'isDMScreenOpen' | 'isGridAlignmentOpen' | 'isFloorPositioning' | 'isDiceLogOpen'
  | 'isHotkeyHelpOpen' | 'isDocsOpen' | 'isAssetManagerOpen' | 'isCommandPaletteOpen' | 'isDiceTrayOpen'
  | MapPopover | 'isToolbarEditing' | 'dungeonGenerator' | 'tableMode';

/** The popovers that stand on one object of the map. */
type MapPopover = 'lightPopover' | 'lightZonePopover' | 'levelLinkPopover' | 'levelSurfacePopover' | 'measurePopover';

/** What a surface's closing writes besides its own field. */
type Companion = 'commandPalettePage' | 'assetManagerInitialTab' | 'assetManagerAddsCombatants' | 'assetManagerArmarium';

/** A draft of a store, as far as surfaces reach into it. */
export type SurfaceDraft = Partial<Pick<ViewAtlasState, Surface | Companion>>;

interface SurfaceRow {
  /** What its closing writes; a view starts so. */
  readonly closed: SurfaceDraft;
  readonly closes?: readonly Surface[];
  /** A level switch closes it, also where its object stands on the level shown next. */
  readonly leavesWithLevel?: true;
  /** It stays open only while this holds; `open` is what its field holds. */
  readonly staysWhile?: StaysWhile;
}

type StaysWhile = (state: ViewAtlasState, open: string) => boolean;

/** A map popover: it closes itself once its object can no longer be edited. */
function popover(surface: MapPopover, closes: readonly MapPopover[], staysWhile: StaysWhile, leavesWithLevel: boolean): SurfaceRow {
  return {
    closed: { [surface]: null },
    closes,
    staysWhile,
    ...(leavesWithLevel && { leavesWithLevel: true }),
  };
}

const flag = (surface: Surface, closes?: readonly Surface[]): SurfaceRow => ({ closed: { [surface]: false }, ...(closes && { closes }) });

const ENDS_TOOLBAR_EDITING: readonly Surface[] = ['isToolbarEditing'];

const SURFACES: Readonly<Record<Surface, SurfaceRow>> = {
  isGridSettingsOpen: flag('isGridSettingsOpen'),
  isDMScreenOpen: flag('isDMScreenOpen'),
  isGridAlignmentOpen: flag('isGridAlignmentOpen'),
  // Placing a floor needs another floor to place it against, and grid alignment takes the map's presses.
  isFloorPositioning: {
    closed: { isFloorPositioning: false },
    staysWhile: (state) => !state.isMapLoading && (state.levels?.length ?? 0) > 1 && !state.isGridAlignmentOpen,
  },
  isDiceLogOpen: flag('isDiceLogOpen'),
  isHotkeyHelpOpen: flag('isHotkeyHelpOpen'),
  isDocsOpen: flag('isDocsOpen'),
  // The palette, the dice tray and the asset manager open where the toolbar editor's tray sits, or over the map.
  isAssetManagerOpen: {
    closed: { isAssetManagerOpen: false, assetManagerInitialTab: undefined, assetManagerAddsCombatants: false, assetManagerArmarium: 0 },
    closes: ENDS_TOOLBAR_EDITING,
  },
  isCommandPaletteOpen: { closed: { isCommandPaletteOpen: false, commandPalettePage: null }, closes: ENDS_TOOLBAR_EDITING },
  isDiceTrayOpen: flag('isDiceTrayOpen', ENDS_TOOLBAR_EDITING),
  lightPopover: popover('lightPopover', ['lightZonePopover', 'measurePopover'], (state, id) => (
    !!readLight(levelObjects(state).lights[id]) && state.isGMView && !state.isMapLoading && lightMarkersShown(state)
  ), true),
  lightZonePopover: popover('lightZonePopover', ['lightPopover', 'measurePopover'], (state, id) => (
    !!levelObjects(state).lightZones?.[id] && state.activeTool === 'wall' && state.isGMView && !state.isMapLoading
  ), true),
  levelLinkPopover: popover('levelLinkPopover', [], (state, id) => (
    stairsShown(state) && state.activeTool === 'stairs' && levelLinkList(levelObjects(state).levelLinks).some((link) => link.id === id)
  ), true),
  levelSurfacePopover: popover('levelSurfacePopover', [], (state, id) => (
    !!levelObjects(state).levelSurfaces?.[id] && state.activeTool === 'wall' && state.isGMView && !state.isMapLoading
  ), false),
  measurePopover: popover('measurePopover', ['lightPopover', 'lightZonePopover'], (state, id) => mayEditMeasure(state, id), true),
  // The editor's tray hangs where the dice tray goes.
  isToolbarEditing: flag('isToolbarEditing', ['isDiceTrayOpen']),
  dungeonGenerator: { closed: { dungeonGenerator: null }, closes: ENDS_TOOLBAR_EDITING },
  // The players' picture: no panel of the GM's over it, and no tool's editor (its popovers go with the GM's view).
  tableMode: {
    closed: { tableMode: null },
    closes: ['isCommandPaletteOpen', 'isDiceTrayOpen', 'isToolbarEditing', 'isHotkeyHelpOpen', 'isGridSettingsOpen', 'isGridAlignmentOpen'],
  },
};

const SURFACE_LIST = Object.entries(SURFACES) as Array<[Surface, SurfaceRow]>;
const STAYING = SURFACE_LIST.filter(([, row]) => row.staysWhile);
const LEAVING_WITH_LEVEL = SURFACE_LIST.flatMap(([surface, row]) => (row.leavesWithLevel ? [surface] : []));

/** Every surface closed: how a view starts. */
export function closedSurfaces(): Pick<ViewAtlasState, Surface | Companion> {
  return Object.assign({}, ...SURFACE_LIST.map(([, row]) => row.closed)) as Pick<ViewAtlasState, Surface | Companion>;
}

export function closeIn(draft: SurfaceDraft, surface: Surface): void {
  Object.assign(draft, SURFACES[surface].closed);
}

/** Opens `surface` with `value` (true, or what it is open on), closing what the row says opening it closes. */
export function openIn<S extends Surface>(draft: SurfaceDraft, surface: S, value: NonNullable<ViewAtlasState[S]>): void {
  (draft as Record<Surface, unknown>)[surface] = value;
  for (const other of SURFACES[surface].closes ?? []) closeIn(draft, other);
}

/** The surfaces that are only open or not. */
type FlagSurface = { [S in Surface]: ViewAtlasState[S] extends boolean ? S : never }[Surface];

export function setOpenIn(draft: SurfaceDraft, surface: FlagSurface, open: boolean): void {
  if (open) openIn(draft, surface, true);
  else closeIn(draft, surface);
}

/** The view shows another level: what a level switch closes. */
export function leaveLevelIn(draft: SurfaceDraft): void {
  for (const surface of LEAVING_WITH_LEVEL) closeIn(draft, surface);
}

/** `next` as it may stand: what can no longer stay open in it, closed. Returned as given when nothing closes. */
function settled(previous: ViewAtlasState, next: Partial<ViewAtlasState>, replace: boolean): Partial<ViewAtlasState> {
  const value = (surface: Surface): unknown => (replace || Object.hasOwn(next, surface) ? next[surface] : previous[surface]);
  if (!STAYING.some(([surface]) => value(surface))) return next;
  const state = (replace ? next : { ...previous, ...next }) as ViewAtlasState;
  const stale = STAYING.filter(([surface, row]) => {
    const open = state[surface];
    return open && !row.staysWhile!(state, open as string);
  });
  if (stale.length === 0) return next;
  const closed = { ...next };
  for (const [surface] of stale) closeIn(closed, surface);
  return closed;
}

type SetState = (partial: unknown, replace?: boolean) => void;
type Creator = (set: SetState, get: () => ViewAtlasState, api: { setState: SetState }) => unknown;

const surfacesMiddleware = (config: Creator): Creator => (set, get, api) => {
  // Outermost, so that undo and redo, which write below the other middleware, are settled too.
  const settle = (write: SetState): SetState => (partial, replace) => write((previous: ViewAtlasState) => {
    const next = (typeof partial === 'function' ? (partial as (state: ViewAtlasState) => unknown)(previous) : partial) as Partial<ViewAtlasState>;
    return next === previous ? next : settled(previous, next, replace === true);
  }, replace);
  api.setState = settle(api.setState);
  return config(settle(set), get, api);
};

/** Applies the surfaces' table on every write of a view store; outermost on it. */
export const withSurfaces = surfacesMiddleware as unknown as <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(config: StateCreator<T, Mps, Mcs>) => StateCreator<T, Mps, Mcs>;

/** What of a view's state decides the bars. */
export type BarState = Pick<ViewAtlasState, 'isToolbarEditing' | 'isMapLoading' | 'isPlayerView' | 'isGMView' | 'activeTool' | 'selectedIds'>
  & Partial<Pick<ViewAtlasState, 'heldRulerFrom' | 'isFloorPositioning'>>;

/** The bars above the toolbar and over a selection, each by what brings it up; none while the toolbar is arranged or a map loads. */
const BARS = {
  fog: (state: BarState) => isFogTool(shownTool(state)) && !state.isPlayerView,
  lighting: (state: BarState) => shownTool(state) === 'wall' && !state.isPlayerView,
  draw: (state: BarState) => shownTool(state) === 'draw' && !state.isPlayerView,
  // The player window measures too.
  measure: (state: BarState) => state.activeTool === 'measure' && state.heldRulerFrom === undefined,
  floorPosition: (state: BarState) => state.isFloorPositioning === true && !state.isPlayerView,
  /** The bar under a selected drawing or text; the canvas says whether one is shown. */
  drawingSelection: (state: BarState) => state.isGMView && !state.isPlayerView,
  /** The actions on what is selected. */
  selectionActions: (state: BarState) => state.selectedIds.length > 0 && toolSelects(state.activeTool) && state.isGMView && !state.isPlayerView,
} satisfies Record<string, (state: BarState) => boolean>;

export type Bar = keyof typeof BARS;

export function barShown(state: BarState, bar: Bar): boolean {
  return !state.isToolbarEditing && !state.isMapLoading && BARS[bar](state);
}
