import { describe, expect, it } from 'vitest';
import { ADD, surfaceView, undo, type SurfaceView } from './surfaceView';
import { SURFACE_NAMES, SURFACES, type SurfaceCase, type SurfaceName } from './surfaces';

/**
 * One row per surface of the view: what closes it, and what it closes when it opens. Every other
 * event and every other surface leaves it as it was.
 */

const EVENTS = {
  deleted: (view: SurfaceView, surface: SurfaceCase): void => view.state().removeObjects([view.ids[surface.object!]]),
  otherLevel: (view: SurfaceView): void => view.state().setViewedLevel('upper'),
  levelItStandsOnToo: (view: SurfaceView): void => view.state().setViewedLevel('upper'),
  otherTool: (view: SurfaceView): void => view.state().setActiveTool('draw'),
  sessionView: (view: SurfaceView): void => view.state().setGMView(false),
  tableMode: (view: SurfaceView): void => view.state().enterTableMode(),
  palette: (view: SurfaceView): void => view.state().setCommandPaletteOpen(true),
  diceTray: (view: SurfaceView): void => view.state().setDiceTrayOpen(true),
  toolbarEditing: (view: SurfaceView): void => view.state().setToolbarEditing(true),
  mapLoading: (view: SurfaceView): void => view.state().setMapLoading(true),
  gridAlignment: (view: SurfaceView): void => view.state().setGridAlignmentOpen(true),
  oneLevel: (view: SurfaceView): void => view.state().setLevels(undefined),
} as const;

type EventName = keyof typeof EVENTS;

const ON_THE_OBJECT: readonly EventName[] = ['deleted'];
/** The events that are a surface of their own opening: a surface is not opened over itself. */
const OPENS: Partial<Record<EventName, SurfaceName>> = { tableMode: 'tableMode', palette: 'palette', diceTray: 'diceTray', toolbarEditing: 'toolbarEditing', gridAlignment: 'gridAlignment' };

const POPOVER_LIFE: EventName[] = ['deleted', 'otherLevel', 'sessionView', 'tableMode', 'mapLoading'];

/** What closes each surface. */
const CLOSED_BY: Readonly<Record<SurfaceName, readonly EventName[]>> = {
  gridSettings: ['tableMode'],
  dmScreen: [],
  gridAlignment: ['tableMode'],
  floorPositioning: ['mapLoading', 'gridAlignment', 'oneLevel'],
  diceLog: [],
  hotkeyHelp: ['tableMode'],
  docs: [],
  assetManager: [],
  palette: ['tableMode'],
  diceTray: ['tableMode', 'toolbarEditing'],
  lightPopover: [...POPOVER_LIFE, 'levelItStandsOnToo'],
  zonePopover: [...POPOVER_LIFE, 'levelItStandsOnToo', 'otherTool'],
  stairsPopover: [...POPOVER_LIFE, 'levelItStandsOnToo', 'otherTool', 'oneLevel'],
  openingPopover: [...POPOVER_LIFE, 'otherTool'],
  measurePopover: POPOVER_LIFE,
  toolbarEditing: ['tableMode', 'palette', 'diceTray'],
  dungeonGenerator: [],
  tableMode: [],
};

const POPOVERS: readonly SurfaceName[] = ['lightPopover', 'zonePopover', 'stairsPopover', 'openingPopover', 'measurePopover'];

/** What each surface closes when it opens. */
const CLOSES: Readonly<Record<SurfaceName, readonly SurfaceName[]>> = {
  gridSettings: [],
  dmScreen: [],
  gridAlignment: ['floorPositioning'],
  floorPositioning: [],
  diceLog: [],
  hotkeyHelp: [],
  docs: [],
  assetManager: ['toolbarEditing'],
  palette: ['toolbarEditing'],
  diceTray: ['toolbarEditing'],
  lightPopover: ['zonePopover', 'measurePopover', 'stairsPopover', 'openingPopover'],
  zonePopover: ['lightPopover', 'measurePopover', 'stairsPopover', 'openingPopover'],
  stairsPopover: ['lightPopover', 'zonePopover', 'openingPopover', 'measurePopover'],
  openingPopover: ['lightPopover', 'zonePopover', 'stairsPopover', 'measurePopover'],
  measurePopover: ['lightPopover', 'zonePopover', 'stairsPopover', 'openingPopover'],
  toolbarEditing: ['diceTray'],
  dungeonGenerator: ['toolbarEditing'],
  tableMode: ['palette', 'diceTray', 'toolbarEditing', 'hotkeyHelp', 'gridSettings', 'gridAlignment', ...POPOVERS],
};

/** What keeps a surface from opening at all. */
const NOT_WHILE: Partial<Record<SurfaceName, readonly SurfaceName[]>> = {
  tableMode: ['assetManager'],
  floorPositioning: ['gridAlignment'],
  ...Object.fromEntries(POPOVERS.map((name) => [name, ['tableMode']])),
};

/** The object stands on both levels, as the stairs always do. */
function onBothLevels(view: SurfaceView, surface: SurfaceCase): void {
  if (surface.object === 'light') view.state().patchObject('lights', view.ids.light, { levels: ['ground', 'upper'] });
  if (surface.object === 'zone') view.state().patchObject('lightZones', view.ids.zone, { levels: ['ground', 'upper'] });
}

function applies(name: SurfaceName, event: EventName): boolean {
  const surface = SURFACES[name];
  if (OPENS[event] === name) return false;
  if (ON_THE_OBJECT.includes(event) || event === 'otherLevel') return surface.object !== undefined;
  if (event === 'levelItStandsOnToo') return surface.object === 'light' || surface.object === 'zone' || surface.object === 'link';
  return true;
}

function opened(name: SurfaceName): SurfaceView {
  const view = surfaceView();
  const surface = SURFACES[name];
  if (surface.tool) view.state().setActiveTool(surface.tool);
  surface.open(view);
  expect(surface.isOpen(view.state())).toBe(true);
  return view;
}

const CASES = SURFACE_NAMES.flatMap((name) => (Object.keys(EVENTS) as EventName[]).filter((event) => applies(name, event)).map((event) => [name, event] as const));

describe('what closes each surface of the view', () => {
  it.each(CASES)('%s, on %s', (name, event) => {
    const view = opened(name);
    if (event === 'levelItStandsOnToo') onBothLevels(view, SURFACES[name]);
    EVENTS[event](view, SURFACES[name]);
    expect(SURFACES[name].isOpen(view.state())).toBe(!CLOSED_BY[name].includes(event));
  });

  it.each(POPOVERS)('%s, when undo takes its object away', (name) => {
    const view = surfaceView();
    const surface = SURFACES[name];
    view.ids[surface.object!] = ADD[surface.object!](view.store);
    if (surface.tool) view.state().setActiveTool(surface.tool);
    surface.open(view);
    undo(view);
    expect(surface.isOpen(view.state())).toBe(false);
  });

  it('a light, in a scene without lighting, while the lighting tool is in hand', () => {
    const view = opened('lightPopover');
    view.state().setActiveTool('wall');
    view.state().setSceneLighting({ enabled: false });
    expect(view.state().lightPopover).toBe(view.ids.light);
    view.state().setActiveTool('move');
    expect(view.state().lightPopover).toBeNull();
  });

  it.each(SURFACE_NAMES)('%s, when it closes', (name) => {
    const view = opened(name);
    SURFACES[name].close(view);
    expect(SURFACES[name].isOpen(view.state())).toBe(false);
  });
});

/** Each surface opened over each other one, with the tool both are opened with: none stand together where they need different tools. */
const PAIRS = SURFACE_NAMES.flatMap((first) => SURFACE_NAMES
  .filter((second) => second !== first)
  .filter((second) => !(SURFACES[first].tool && SURFACES[second].tool && SURFACES[first].tool !== SURFACES[second].tool))
  .map((second) => [first, second] as const));

describe('what each surface closes when it opens', () => {
  it.each(PAIRS)('%s, then %s', (first, second) => {
    const view = surfaceView();
    view.state().setActiveTool(SURFACES[first].tool ?? SURFACES[second].tool ?? 'move');
    SURFACES[first].open(view);
    SURFACES[second].open(view);
    expect({
      first: SURFACES[first].isOpen(view.state()),
      second: SURFACES[second].isOpen(view.state()),
    }).toEqual({
      first: !CLOSES[second].includes(first) || (NOT_WHILE[second] ?? []).includes(first),
      second: !(NOT_WHILE[second] ?? []).includes(first),
    });
  });

  it('the Armarium ends toolbar editing, as the asset manager does', () => {
    const view = surfaceView();
    view.state().setToolbarEditing(true);
    view.state().openArmarium();
    expect(view.state().isToolbarEditing).toBe(false);
  });
});
