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

/** The popovers that stand on one object of the map: one at a time. */
type MapPopover = 'lightPopover' | 'lightZonePopover' | 'levelLinkPopover' | 'levelSurfacePopover' | 'measurePopover';

/** What a surface's closing writes besides its own field. */
type Companion = 'commandPalettePage' | 'assetManagerInitialTab' | 'assetManagerAddsCombatants' | 'assetManagerArmarium';

/** A draft of a store, as far as surfaces reach into it. */
export type SurfaceDraft = Partial<Pick<ViewAtlasState, Surface | Companion>>;

export interface SurfaceRow {
  /** What its closing writes; a view starts so. */
  readonly closed: SurfaceDraft;
  readonly closes?: readonly Surface[];
  /** A level switch closes it, also where its object stands on the level shown next. */
  readonly leavesWithLevel?: true;
  readonly staysWhile?: StaysWhile;
}

type Objects = ViewAtlasState['objects'];

/** A key of the state a rule reads, or one kind of its objects: a token's move is no change to a light. */
export type Read = Exclude<keyof ViewAtlasState, 'objects'> | `objects.${keyof Objects}`;

type KindOf<R> = R extends `objects.${infer Kind}` ? Kind & keyof Objects : never;

/** The state a rule that reads `R` is handed: those keys, and those kinds of objects, alone. */
type ReadState<R extends Read> = Pick<ViewAtlasState, Exclude<R, `objects.${string}`>>
  & ([KindOf<R>] extends [never] ? unknown : { objects: Pick<Objects, KindOf<R>> });

/**
 * It stays open only while `rule` holds of what it `reads` (`open` is what its field holds), and is
 * handed nothing else. A kind of objects it does not declare does not compile; a key it does not
 * declare may (optional keys such as `viewedLevel` read as undefined), which
 * `tests/unit/viewSurfaces/surfaceReads.test.ts` holds instead.
 */
export interface StaysWhile {
  readonly reads: readonly Read[];
  readonly rule: (state: object, open: string) => boolean;
}

function staysWhile<R extends Read>(reads: readonly R[], rule: (state: ReadState<R>, open: string) => boolean): StaysWhile {
  return { reads, rule: rule as StaysWhile['rule'] };
}

/** Whether what a rule reads is the same in both states. */
function readsSame(reads: readonly Read[], value: (key: keyof ViewAtlasState) => unknown, previous: ViewAtlasState): boolean {
  return reads.every((read) => {
    if (!read.startsWith('objects.')) return value(read as keyof ViewAtlasState) === previous[read as keyof ViewAtlasState];
    const kind = read.slice('objects.'.length) as keyof Objects;
    return (value('objects') as Objects | undefined)?.[kind] === previous.objects?.[kind];
  });
}

/** What a rule is handed: the keys it reads, and the whole of `objects` where it reads a kind of them. */
function inputsOf(reads: readonly Read[], value: (key: keyof ViewAtlasState) => unknown): object {
  return Object.fromEntries(reads.map((read) => {
    const key = (read.startsWith('objects.') ? 'objects' : read) as keyof ViewAtlasState;
    return [key, value(key)];
  }));
}

/** What a map popover's object is read from: the level shown, in the GM's view of a loaded scene. */
const ON_THE_MAP = ['levels', 'viewedLevel', 'isGMView', 'isMapLoading'] as const;

const MAP_POPOVERS: readonly MapPopover[] = ['lightPopover', 'lightZonePopover', 'levelLinkPopover', 'levelSurfacePopover', 'measurePopover'];

/** A map popover: it closes the others, and closes itself once its object can no longer be edited. */
function popover(surface: MapPopover, staysWhile: StaysWhile, leavesWithLevel: boolean): SurfaceRow {
  return {
    closed: { [surface]: null },
    closes: MAP_POPOVERS.filter((other) => other !== surface),
    staysWhile,
    ...(leavesWithLevel && { leavesWithLevel: true }),
  };
}

const flag = (surface: Surface, closes?: readonly Surface[]): SurfaceRow => ({ closed: { [surface]: false }, ...(closes && { closes }) });

const ENDS_TOOLBAR_EDITING: readonly Surface[] = ['isToolbarEditing'];

export const SURFACES: Readonly<Record<Surface, SurfaceRow>> = {
  isGridSettingsOpen: flag('isGridSettingsOpen'),
  isDMScreenOpen: flag('isDMScreenOpen'),
  isGridAlignmentOpen: flag('isGridAlignmentOpen'),
  // Placing a floor needs another floor to place it against, and grid alignment takes the map's presses.
  isFloorPositioning: {
    closed: { isFloorPositioning: false },
    staysWhile: staysWhile(['isMapLoading', 'levels', 'isGridAlignmentOpen'], (state) => (
      !state.isMapLoading && (state.levels?.length ?? 0) > 1 && !state.isGridAlignmentOpen
    )),
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
  lightPopover: popover('lightPopover', staysWhile([...ON_THE_MAP, 'objects.lights', 'lighting', 'activeTool'], (state, id) => (
    !!readLight(levelObjects(state).lights[id]) && state.isGMView && !state.isMapLoading && lightMarkersShown(state)
  )), true),
  lightZonePopover: popover('lightZonePopover', staysWhile([...ON_THE_MAP, 'objects.lightZones', 'activeTool'], (state, id) => (
    !!levelObjects(state).lightZones?.[id] && state.activeTool === 'wall' && state.isGMView && !state.isMapLoading
  )), true),
  levelLinkPopover: popover('levelLinkPopover', staysWhile([...ON_THE_MAP, 'objects.levelLinks', 'isPlayerView', 'activeTool'], (state, id) => (
    stairsShown(state) && state.activeTool === 'stairs' && levelLinkList(levelObjects(state).levelLinks).some((link) => link.id === id)
  )), true),
  levelSurfacePopover: popover('levelSurfacePopover', staysWhile([...ON_THE_MAP, 'objects.levelSurfaces', 'activeTool'], (state, id) => (
    !!levelObjects(state).levelSurfaces?.[id] && state.activeTool === 'wall' && state.isGMView && !state.isMapLoading
  )), false),
  measurePopover: popover('measurePopover', staysWhile([...ON_THE_MAP, 'objects.measures', 'isPlayerView'], (state, id) => mayEditMeasure(state, id)), true),
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
const STAYING = SURFACE_LIST.flatMap(([surface, { staysWhile }]) => (staysWhile ? [[surface, { staysWhile }] as const] : []));
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

/**
 * `next` as it may stand: what can no longer stay open in it, closed. Returned as given when
 * nothing closes. `previous` stood, so a surface whose field and declared keys are as they were
 * still stands, and its rule is not asked again.
 */
function settled(previous: ViewAtlasState, next: Partial<ViewAtlasState>, replace: boolean): Partial<ViewAtlasState> {
  const value = <K extends keyof ViewAtlasState>(key: K): ViewAtlasState[K] | undefined => (replace || Object.hasOwn(next, key) ? next[key] : previous[key]);
  let closed: Partial<ViewAtlasState> | null = null;
  for (const [surface, { staysWhile: { reads, rule } }] of STAYING) {
    const open = value(surface);
    if (!open || (open === previous[surface] && readsSame(reads, value, previous))) continue;
    if (rule(inputsOf(reads, value), open as string)) continue;
    closeIn(closed ??= { ...next }, surface);
  }
  return closed ?? next;
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
  fog: (state: BarState): boolean => isFogTool(shownTool(state)) && !state.isPlayerView,
  lighting: (state: BarState): boolean => shownTool(state) === 'wall' && !state.isPlayerView,
  draw: (state: BarState): boolean => shownTool(state) === 'draw' && !state.isPlayerView,
  // The player window measures too.
  measure: (state: BarState): boolean => state.activeTool === 'measure' && state.heldRulerFrom === undefined,
  floorPosition: (state: BarState): boolean => state.isFloorPositioning === true && !state.isPlayerView,
  /** The bar under a selected drawing or text; the canvas says whether one is shown. */
  drawingSelection: (state: BarState): boolean => state.isGMView && !state.isPlayerView,
  /** The actions on what is selected. */
  selectionActions: (state: BarState): boolean => state.selectedIds.length > 0 && toolSelects(state.activeTool) && state.isGMView && !state.isPlayerView,
} satisfies Record<string, (state: BarState) => boolean>;

export type Bar = keyof typeof BARS;

export function barShown(state: BarState, bar: Bar): boolean {
  return !state.isToolbarEditing && !state.isMapLoading && BARS[bar](state);
}
