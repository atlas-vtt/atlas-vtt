import { describe, expect, it } from 'vitest';
import type { ViewAtlasState } from '../../../src/app/storeFactory';
import { SURFACES, type Read, type StaysWhile, type Surface } from '../../../src/app/stores/viewSurfaces';
import { surfaceView, type PopoverObject, type SurfaceView } from './surfaceView';

/**
 * What each rule that keeps a surface open reads, against what it declares: the store hands a rule
 * its declared keys alone, so a key it reads and does not declare would be undefined there. Each
 * rule runs on the whole state in states that take its branches; keys are recorded as read, and an
 * undeclared kind of objects is emptied to see whether the answer follows it.
 */

/** What each map popover's rule is asked about. */
const OBJECT_OF: Partial<Record<Surface, PopoverObject>> = {
  lightPopover: 'light', lightZonePopover: 'zone', levelLinkPopover: 'link', levelSurfacePopover: 'surface', measurePopover: 'measure',
};

/** States that take the rules' branches: each tool they ask about, lit or not, the object gone or elsewhere, each view. */
const STATES: Readonly<Record<string, (view: SurfaceView) => void>> = {
  lightingTool: (view) => view.state().setActiveTool('wall'),
  stairsTool: (view) => view.state().setActiveTool('stairs'),
  moveTool: (view) => view.state().setActiveTool('move'),
  unlitMoveTool: (view) => { view.state().setSceneLighting({ enabled: false }); view.state().setActiveTool('move'); },
  unlitLightingTool: (view) => { view.state().setSceneLighting({ enabled: false }); view.state().setActiveTool('wall'); },
  otherLevel: (view) => view.state().setViewedLevel('upper'),
  objectGone: (view) => view.state().removeObjects(Object.values(view.ids)),
  sessionView: (view) => view.state().setGMView(false),
  playerView: (view) => view.store.setState({ isPlayerView: true }),
  mapLoading: (view) => view.state().setMapLoading(true),
  oneLevel: (view) => view.state().setLevels(undefined),
  gridAlignment: (view) => view.state().setGridAlignmentOpen(true),
};

const RULES = (Object.entries(SURFACES) as Array<[Surface, { staysWhile?: StaysWhile }]>)
  .flatMap(([surface, { staysWhile }]) => (staysWhile ? [[surface, staysWhile] as const] : []));

const isKind = (read: Read): boolean => read.startsWith('objects.');

/** The keys of the state the rule is handed: those it declares, and `objects` where it declares a kind of them. */
function declaredKeys({ reads }: StaysWhile): Set<string> {
  return new Set(reads.map((read) => (isKind(read) ? 'objects' : read)));
}

/** The state `rule` sees, recording each of its keys read. */
function recording(state: ViewAtlasState, read: Set<string>): ViewAtlasState {
  return new Proxy(state, {
    get: (target, key, receiver): unknown => {
      if (typeof key === 'string') read.add(key);
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}

function stateIn(name: string): { view: SurfaceView; state: ViewAtlasState } {
  const view = surfaceView();
  STATES[name]!(view);
  return { view, state: view.state() };
}

const openOn = (surface: Surface, view: SurfaceView): string => {
  const object = OBJECT_OF[surface];
  return object ? view.ids[object] : 'open';
};

describe('what each rule that keeps a surface open reads', () => {
  it('covers every rule', () => {
    expect(RULES.map(([surface]) => surface).sort()).toEqual([...Object.keys(OBJECT_OF), 'isFloorPositioning'].sort());
  });

  it.each(RULES)('%s reads no key it does not declare', (surface, staysWhile) => {
    const read = new Set<string>();
    for (const name of Object.keys(STATES)) {
      const { view, state } = stateIn(name);
      staysWhile.rule(recording(state, read), openOn(surface, view));
    }
    const declared = declaredKeys(staysWhile);
    expect([...read].filter((key) => !declared.has(key)).map((key) => `${surface} reads ${key}`)).toEqual([]);
  });

  it.each(RULES)('%s answers the same whatever an undeclared kind of objects holds', (surface, staysWhile) => {
    const undeclared = (state: ViewAtlasState): string[] => Object.keys(state.objects).filter((kind) => !staysWhile.reads.includes(`objects.${kind}` as Read));
    const following: string[] = [];
    for (const name of Object.keys(STATES)) {
      const { view, state } = stateIn(name);
      const open = openOn(surface, view);
      const answer = staysWhile.rule(state, open);
      for (const kind of undeclared(state)) {
        if (staysWhile.rule({ ...state, objects: { ...state.objects, [kind]: {} } }, open) !== answer) following.push(`${surface} reads objects.${kind} (${name})`);
      }
    }
    expect(following).toEqual([]);
  });
});
