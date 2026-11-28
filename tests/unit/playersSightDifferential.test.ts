// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { levelObjects } from '../../src/app/levels/levelObjects';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import type { SceneState } from '../../src/app/online/gm/atlasView';
import { floorPorts } from '../../src/app/online/gm/floorPorts';
import type { FloorRoutes } from '../../src/app/online/gm/floorRoutes';
import { gmTabOf } from '../../src/app/online/gm/gmTab';
import type { SceneSharePorts } from '../../src/app/online/gm/sceneSharePorts';
import { mapTokens } from '../../src/app/tokens/offMap';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { TokenEntity } from '../../src/app/types';
import { PLAYER_SIGHT_POLICY } from '../../src/app/vision/tokenSightPolicy';
import { bareMapView, type BareMapView } from '../helpers/bareMapView';
import { genericLight } from '../mocks/lights';

/*
 * The players' picture of a floor worked out two ways, held to the same answers over generated scenes: by the GM's
 * canvas (Atlas's lighting view, its sight worked out as on the GPU path, with the canvas's players' frame) and by the
 * floor model the table works out on the CPU for a floor the GM does not look at. What each floor's players are told
 * of tokens, sensed tokens, doors and the places pins stand at is compared. Where the two disagree, the kind of
 * disagreement is counted and the counts are pinned. Two rules of one side cause them all: the CPU reads a floor with
 * a roof failing closed (only the party's own tokens), where the canvas reads the roof it draws for tokens and none
 * for doors and pins; and the CPU builds lights without the light walls reflect, so what only reflected light lights
 * is seen from the canvas alone.
 */

vi.mock('../../src/app/pixi/lighting/engine/LightingEngine', async () => {
  const { Container: Layer } = await import('pixi.js');
  return {
    LightingEngine: class {
      readonly layer = new Layer();
      readonly failed = false;
      takeRestored(): boolean { return false; }
      renderFrame<T>(_frame: unknown, render: () => T): T { return render(); }
      hasWorld(): boolean { return false; }
      busy(): boolean { return false; }
      animate(): boolean { return false; }
      setEnabled(): void {}
      setCoverage(): void {}
      setExplored(): void {}
      setMode(): void {}
      setView(): void {}
      setGrid(): void {}
      update(): void {}
      flush(): void {}
      fail(): void {}
      destroy(): void {}
    },
  };
});
vi.mock('../../src/app/pixi/lighting/ExploredMemory', () => ({
  ExploredMemory: class {
    sync(): void {}
    record(): void {}
    stampDue(): boolean { return false; }
    reload(): void {}
    reset(): void {}
    edit(): boolean { return false; }
    forgetEdits(): void {}
    holdSaves(): void {}
    cancelSaves(): void {}
    beforeMapUnload(): void {}
    destroy(): void {}
  },
}));
// Atlas's lighting view itself, its GPU engine and explored memory left out: the view works the sight out as Atlas does.
vi.mock('../../src/app/pixi/lighting/createSceneLighting', async () => {
  const { LightingRenderer } = await import('../../src/app/pixi/lighting/LightingRenderer');
  return {
    createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => new LightingRenderer({
      viewport: deps.viewport, app: deps.app, store: deps.scene ?? deps.store, measurement: deps.measurement, bounds: () => ({ width: 1000, height: 600 }),
      albedo: () => null, ...(deps.rules && { rules: deps.rules }), ...(deps.onSightChange && { onSightChange: deps.onSightChange }),
    }),
  };
});
/** Whether the canvas has drawn the floor its view shows: then that floor is read from it, else worked out on the CPU. */
const canvas = vi.hoisted(() => ({ drawn: true }));
vi.mock('../../src/app/MapController', async (original) => {
  const { MapController } = await original<typeof import('../../src/app/MapController')>();
  return { MapController: { ...MapController, showsViewedLevel: () => canvas.drawn } };
});

const MAP = { width: 1000, height: 600 };
const SCENES = 40;
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 } },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, foreground: 'art/roof.webp' },
];
const SENSES = [[], [{ id: 'darkvision', range: 30 }], [{ id: 'tremorsense', range: 20 }]] as const;
const NO_MARKS = { source: () => null, showPlayers: () => undefined, showPlayerDrags: () => undefined, showPlayerCursors: () => undefined, showPlayerStrokes: () => undefined };

function seeded(seed: number): () => number {
  return (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

/** A scene of two floors, the upper one under a roof: walls with a door, lights, tokens with and without senses, a fog patch, pins. */
function generate(random: () => number): Pick<SceneState, 'levels' | 'lighting' | 'heldTokens'> & { objects: Pick<SceneState['objects'], 'tokens' | 'walls' | 'lights' | 'fog' | 'pins'> } {
  const at = (): { x: number; y: number } => ({ x: Math.round(40 + random() * 920), y: Math.round(40 + random() * 520) });
  const tokens: Record<string, TokenEntity> = {};
  for (const level of ['ground', 'upper'] as const) {
    const count = 2 + Math.floor(random() * 4);
    for (let n = 0; n < count; n++) {
      const id = `${level}${n}`;
      const party = n === 0 || random() < 0.25;
      tokens[id] = {
        id, kind: party ? 'character' : 'token', imagePath: `art/${id}.webp`, size: 1, ...at(), ...(level === 'upper' && { level }),
        isHidden: !party && random() < 0.2,
        ...(party && { vision: { enabled: true, ...(random() < 0.7 && { range: 20 + Math.round(random() * 40) }), senses: [...SENSES[Math.floor(random() * SENSES.length)]!] } }),
      } as TokenEntity;
    }
  }
  const door = { id: 'door', kind: 'wall', type: 'door', closed: random() < 0.5, p1: { x: 500, y: 250 }, p2: { x: 500, y: 350 } } as WallSegment;
  const walls: Record<string, WallSegment> = {
    north: { id: 'north', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 250 } } as WallSegment, door,
    south: { id: 'south', kind: 'wall', type: 'solid', p1: { x: 500, y: 350 }, p2: { x: 500, y: 600 } } as WallSegment,
    loose: { id: 'loose', kind: 'wall', type: 'solid', p1: at(), p2: at() } as WallSegment,
  };
  // The same walls stand upstairs, and the door there is open or shut by itself.
  for (const wall of Object.values({ ...walls })) walls[`${wall.id}Up`] = { ...wall, id: `${wall.id}Up`, level: 'upper', ...(wall.type === 'door' && { closed: random() < 0.5 }) } as WallSegment;
  const lights: Record<string, LightSource> = {};
  for (let n = 0; n < Math.floor(random() * 3); n++) lights[`light${n}`] = { id: `light${n}`, kind: 'light', ...at(), emission: genericLight('torch'), ...(random() < 0.5 && { level: 'upper' }) } as LightSource;
  const fog: Record<string, FogOperation> = {};
  for (const level of [undefined, 'upper']) if (random() < 0.6) fog[`patch${level ?? ''}`] = { id: `patch${level ?? ''}`, kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', ...at(), width: 200, height: 160, ...(level && { level }) } as FogOperation;
  const pins = Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) => [`pin${n}`, { id: `pin${n}`, kind: 'pin', ...at(), notePath: `Notes/pin${n}.md`, readable: true, ...(n > 2 && { level: 'upper' }) }]));
  const ambient = [0, 0.4, 1][Math.floor(random() * 3)]!;
  return { levels: LEVELS, lighting: { enabled: true, ambient }, heldTokens: {}, objects: { tokens, walls, lights, fog, pins } as never };
}

/** A floor's answers: the tokens the players are named, those they sense (by place), the doors and pins they see. */
interface Answers { readonly tokens: string[]; readonly sensed: string[]; readonly doors: string[]; readonly pins: string[] }

/** What the players of `floor` are told of it now, read as the table reads it: from the GM's canvas, or worked out on the CPU. */
function answersOf(view: BareMapView, floor: string): Answers {
  const { renderer, store } = view;
  const tabView = { app: view.obsidian, serviceManager: { getAssetService: () => null, getToolController: () => null, getEventBus: () => view.events } };
  const gm = gmTabOf({ leaf: { view: tabView } as unknown as WorkspaceLeaf, view: tabView as never, store, renderer }, NO_MARKS);
  const state = (): SceneState => store.getState() as SceneState;
  const ports = floorPorts({ tab: () => gm } as unknown as SceneSharePorts, {
    floor, state, map: () => MAP, cell: () => 70, aliases: new Map(), routes: {} as FloorRoutes, notice: () => undefined, describe: () => undefined,
  });
  const objects = levelObjects(state());
  const fog = fogCoverage(objects.fog);
  const pins = Object.values(objects.pins ?? {});
  const seen = ports.mapLayers()?.pointsSeen(pins.map(({ x, y }) => ({ x, y })), fog) ?? null;
  return {
    tokens: [...(ports.tokenSource()?.playerRollTokens(state().mapPath!).keys() ?? [])].sort(),
    sensed: (ports.mapLayers()?.sensed(mapTokens(objects)) ?? []).map(({ x, y }) => `${x},${y}`).sort(),
    doors: [...(ports.mapLayers()?.doorsSeen(objects.walls, fog) ?? [])].sort(),
    pins: seen === null ? ['(cannot tell)'] : pins.filter((_, index) => seen[index]).map(({ id }) => id).sort(),
  };
}

const views: BareMapView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  canvas.drawn = true;
});

describe('the players\' picture of a floor, from the GM\'s canvas and worked out on the CPU', () => {
  it(`gives the same answers but where a rule of one side differs (${SCENES} generated scenes of two floors)`, async () => {
    const view = await bareMapView({ whole: {}, grid: { size: 70, enabled: true, color: 0xffffff } });
    views.push(view);
    const disagreements: Record<string, number> = {};
    const shown: Record<string, number> = {};
    let compared = 0;
    for (let seed = 1; seed <= SCENES; seed++) {
      const generated = generate(seeded(seed));
      for (const floor of ['ground', 'upper']) {
        view.store.setState((state) => ({ ...generated, viewedLevel: floor, objects: { ...state.objects, ...generated.objects } }));
        const shownTokens = Object.values(mapTokens(levelObjects(view.store.getState())));
        await vi.waitFor(() => expect(shownTokens.every((token) => view.renderer.getTokenRenderer()?.getTokenSprites()[token.id])).toBe(true));
        // The roof drawn over the upper floor: its east half, one piece, faded where one of the party stands under it.
        const partyEast = shownTokens.some((token) => token.x > 500 && PLAYER_SIGHT_POLICY.alwaysSeen(token));
        view.renderer.getTokenRenderer()!.setRoofProvider((point) => floor === 'upper' && point.x > 500 && !partyEast);
        canvas.drawn = true;
        const gpu = answersOf(view, floor);
        canvas.drawn = false;
        const cpu = answersOf(view, floor);
        compared += 1;
        for (const kind of ['tokens', 'sensed', 'doors', 'pins'] as const) {
          shown[`${floor}: ${kind} the canvas shows`] = (shown[`${floor}: ${kind} the canvas shows`] ?? 0) + gpu[kind].length;
          for (const item of gpu[kind]) if (!cpu[kind].includes(item)) disagreements[`${floor}: ${kind} the canvas shows and the CPU does not`] = (disagreements[`${floor}: ${kind} the canvas shows and the CPU does not`] ?? 0) + 1;
          for (const item of cpu[kind]) if (!gpu[kind].includes(item)) disagreements[`${floor}: ${kind} the CPU shows and the canvas does not`] = (disagreements[`${floor}: ${kind} the CPU shows and the canvas does not`] ?? 0) + 1;
        }
      }
    }
    expect(compared).toBe(SCENES * 2);
    expect({ shown, disagreements }).toMatchSnapshot();
  }, 30_000);
});
