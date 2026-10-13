import { EventEmitter } from 'events';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { lightList, readEmission, readLight, readWall } from '../../src/app/lighting/lightingObjects';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { DoorIcons } from '../../src/app/pixi/lighting/DoorIcons';
import { LightMarkers } from '../../src/app/pixi/lighting/LightMarkers';
import { LightRangeRings } from '../../src/app/pixi/lighting/LightRangeRings';
import { SceneModelBuilder } from '../../src/app/vision/sceneModel';
import { WallEditor } from '../../src/app/pixi/lighting/WallEditor';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { wallList } from '../../src/app/vision/wallList';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const torch = { bright: 20, dim: 40, color: '#ffffff', intensity: 1, animation: 'none' };
const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;

/** What a damaged or foreign map file can hold where lights, walls and a carried light belong. */
const BROKEN = {
  lights: {
    good: { id: 'good', kind: 'light', x: 300, y: 300, emission: torch },
    bare: { id: 'bare', kind: 'light', x: 100, y: 100 },
    empty: { id: 'empty', kind: 'light', x: 100, y: 100, emission: null },
    text: { id: 'text', kind: 'light', x: 100, y: 100, emission: 'torch' },
    radii: { id: 'radii', kind: 'light', x: 100, y: 100, emission: { ...torch, bright: 'far', dim: null } },
    nowhere: { id: 'nowhere', kind: 'light', x: 'left', emission: torch },
    word: 'a light',
    nothing: null,
  },
  walls: {
    good: { id: 'good', kind: 'wall', type: 'door', closed: true, p1: { x: 400, y: 0 }, p2: { x: 400, y: 600 } },
    endless: { id: 'endless', kind: 'wall', type: 'solid' },
    half: { id: 'half', kind: 'wall', type: 'door', p1: { x: 10, y: 10 } },
    words: { id: 'words', kind: 'wall', type: 'solid', p1: 'here', p2: 'there' },
    lost: { id: 'lost', kind: 'wall', type: 'door', p1: { x: Number.NaN, y: 0 }, p2: { x: 50, y: Infinity } },
    word: 'a wall',
    nothing: null,
  },
  tokens: {
    viewer: { id: 'viewer', kind: 'token', imagePath: 'v.png', x: 200, y: 300, vision: { enabled: true } },
    carrier: { id: 'carrier', kind: 'token', imagePath: 'c.png', x: 60, y: 60, light: 'torch' },
    lantern: { id: 'lantern', kind: 'token', imagePath: 'l.png', x: 60, y: 200, light: { bright: 'much' } },
  },
};

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function store(): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const made = createViewAtlasStore(app, `broken-${Math.random()}`);
  made.getState().setPersistenceEnabled(false);
  made.getState().setSceneLighting({ enabled: true, ambient: 0 });
  made.setState({ objects: { ...made.getState().objects, ...BROKEN } as never });
  return made;
}

describe('objects lighting cannot read', () => {
  it('read as none: a light without an emission or a place, a wall without two ends, a carried light that is a word', () => {
    expect(lightList(BROKEN.lights as never).map((light) => light.id)).toEqual(['good']);
    expect(Object.entries(BROKEN.lights).filter(([, value]) => readLight(value)).map(([id]) => id)).toEqual(['good']);
    expect(wallList(BROKEN.walls as never).map((wall) => wall.id)).toEqual(['good']);
    expect(Object.entries(BROKEN.walls).filter(([, value]) => readWall(value)).map(([id]) => id)).toEqual(['good']);
    expect(readEmission('torch')).toBeNull();
    expect(readEmission({ bright: 'much' })).toBeNull();
    expect(readEmission(undefined)).toBeNull();
  });

  it('are mended where only a detail is wrong: a colour that is none is white, an intensity that is no number 1', () => {
    expect(readEmission({ bright: 5, dim: 10, color: 'mauve', intensity: 'high', animation: 7, sourceRadius: 'big' })).toEqual({ bright: 5, dim: 10, color: '#ffffff', intensity: 1, animation: 'none' });
  });

  it('are left out of the scene, which builds with the rest: walls sealed, lights and their reaches, sight', () => {
    const made = store();
    const state = made.getState();
    expect(sealedWalls(wallList(state.objects.walls), 2).map((wall) => wall.id)).toEqual(['good']);
    const { model } = new SceneModelBuilder().update(state, { width: 1000, height: 600 }, measurement);
    expect(model.lights.map((light) => light.key)).toEqual(['light:good']);
    expect(model.reaches).toHaveLength(1);
    expect(model.walls.map((wall) => wall.id)).toEqual(['good']);
    expect(model.sight.regions.length).toBeGreaterThan(0);
  });

  it('do not stop what the GM sees of the lighting: markers, rings, door badges and the wall tool draw the rest', () => {
    const restoreGraphics = stubJsdomGraphics();
    const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events: { domElement: document.createElement('canvas') } as unknown as EventSystem });
    const made = store();
    const markers = new LightMarkers(viewport, made);
    const rings = new LightRangeRings(viewport, made, measurement);
    const doors = new DoorIcons(made, document.createElement('canvas'));
    const editor = new WallEditor(viewport, made, new EventEmitter(), () => undefined, () => []);
    cleanup = () => {
      markers.destroy();
      rings.destroy();
      doors.destroy();
      editor.destroy();
      viewport.destroy();
      restoreGraphics();
    };
    made.getState().setActiveTool('wall');
    expect(markers.view.children).toHaveLength(1);
    expect(markers.hitTest(300, 300)).toBe('good');
    expect(markers.hitTest(100, 100)).toBeNull();
    expect(doors.hitTest(400, 300)).toBe('good');
    // Opening a light that cannot be read shows nothing and throws nothing; a change to the walls redraws.
    for (const id of ['bare', 'empty', 'text', 'radii', 'nowhere', 'word', 'good']) made.getState().openLightPopover(id);
    made.getState().toggleDoor('good');
    made.getState().toggleDoor('half');
    expect(made.getState().objects.walls.good!.closed).toBe(false);
    expect(editor.cursorAt({ x: 10, y: 10 })).toBeDefined();
  });
});
