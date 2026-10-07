import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../src/app/storeFactory';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import { SceneModelBuilder } from '../../src/app/pixi/lighting/sceneModel';
import { heldForSight, holdTokens } from '../../src/app/lighting/sightOnDrop';
import { getHistoryStore } from '../../src/app/stores/history';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { TokenEntity } from '../../src/app/types';
import type { LightEmission, SceneLighting, SceneLightingChanges } from '../../src/app/types/lightingTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { ExploredShapes } from '../../src/app/vision/exploredShapes';
import { SEES_ALL, type LightReach, type Sight } from '../../src/app/vision/sight';
import { pointInPolygon, type Polygon } from '../../src/app/vision/visibility';
import { NORMAL_SIGHT } from '../../src/app/gameSystems/senses';
import type { Point } from '../../src/app/types/visionTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const BOUNDS = { width: 1000, height: 600 };
const MEASUREMENT: MeasurementSettings = { mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] };

/** Two rooms, left and right of a wall at x = 500 with a doorway from y = 250 to 350. */
const WALLS: Record<string, WallSegment> = {
  north: { id: 'north', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 250 } },
  south: { id: 'south', kind: 'wall', type: 'solid', p1: { x: 500, y: 350 }, p2: { x: 500, y: 600 } },
};
const LEFT_ROOM = { x: 200, y: 300 };
const RIGHT_ROOM = { x: 700, y: 300 };
/** A corner of the right room that the doorway does not show from `LEFT_ROOM`. */
const RIGHT_CORNER = { x: 800, y: 100 };

/** Reaches 140 px: from one room it lights nothing of the other. */
const TORCH: LightEmission = { bright: 5, dim: 10, color: '#ffaa55', intensity: 1, animation: 'none' };

function token(id: string, at: { x: number; y: number }, extra: Partial<TokenEntity> = {}): TokenEntity {
  return { id, kind: 'token', imagePath: `${id}.png`, ...at, ...extra } as TokenEntity;
}

const hero = (extra: Partial<TokenEntity> = {}): TokenEntity => token('hero', LEFT_ROOM, { vision: { enabled: true }, ...extra });

/**
 * The scene as `LightingRenderer` builds it from the store, through the builder it uses itself
 * (`SceneModelBuilder`): each rebuild takes the model's sight and reaches and records what the
 * tokens see as explored, as the renderer does.
 */
class SceneRig {
  rebuilds = 0;
  /** The sight of the vision tokens: where each sees from and what, one entry per token. */
  sight: { all: boolean; origins: Point[]; polygons: (Polygon | null)[] } = { all: true, origins: [], polygons: [] };
  private perceived: Sight = SEES_ALL;
  reaches: LightReach[] = [];
  lightsAt: Array<{ key: string; x: number; y: number }> = [];
  readonly recorded: ExploredShapes[] = [];
  private readonly model = new SceneModelBuilder();

  constructor(private readonly store: ViewAtlasStore) {
    store.subscribe((state) => this.update(state));
    this.update(store.getState());
  }

  private update(state: ViewAtlasState): void {
    const { model, rebuilt } = this.model.update(state, BOUNDS, () => MEASUREMENT);
    if (!rebuilt) return;
    this.rebuilds++;
    this.perceived = model.sight;
    const seeing = model.sight.regions.filter((region) => region.sense === NORMAL_SIGHT);
    this.sight = { all: model.sight.all, origins: seeing.map((region) => region.origin), polygons: seeing.map((region) => region.polygon) };
    this.reaches = model.reaches;
    this.lightsAt = model.lights.map(({ key, x, y }) => ({ key, x, y }));
    if (model.explored) this.recorded.push(model.explored);
  }

  explored(point: { x: number; y: number }): boolean {
    return this.recorded.some(({ polygons, clip }) => polygons.some((polygon) => pointInPolygon(point, polygon))
      && (!clip || clip.some((polygon) => pointInPolygon(point, polygon))));
  }

  /** Whether the players see the token, as their frame and session view decide. */
  seen(tokenId: string): boolean {
    const state = this.store.getState();
    return tokenPerception(this.perceived, state.lighting, this.reaches, state.objects.tokens, { held: heldForSight(state) })(tokenId) !== 'unseen';
  }
}

interface Scene {
  store: ViewAtlasStore;
  rig: SceneRig;
  controller: InteractionController;
  /** Presses the token, as the viewport's dispatch does. */
  press: (tokenId: string, modifiers?: { altKey?: boolean; shiftKey?: boolean }) => void;
  /** Moves the pointer to `point`, 60 ms after its last move, so the position reaches the store. */
  dragTo: (point: { x: number; y: number }) => void;
  release: (point: { x: number; y: number }) => void;
  at: (tokenId: string) => { x: number; y: number };
  /** The canvas the pointer events come from. */
  canvas: HTMLCanvasElement;
}

let now = 0;

function createScene(tokens: TokenEntity[], lighting: SceneLightingChanges = {}): Scene {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `sight-on-drop-${Math.random()}`);
  store.setState({
    persistenceEnabled: false,
    objects: { ...store.getState().objects, walls: WALLS, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) },
  });
  // The scenes here wait for the drop unless a test says otherwise: that is the option under test.
  store.getState().setSceneLighting({ enabled: true, ambient: 1, sightOnDrop: true, ...lighting });
  getHistoryStore(store)?.getState().clear();

  const handlers = new Map<string, (event: unknown) => void>();
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const viewport = {
    on: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    off: (name: string) => handlers.delete(name),
    toWorld: (point: { x: number; y: number }) => point,
    plugins: { pause: vi.fn(), resume: vi.fn() },
    options: { events: { domElement: canvas } },
  };
  const gridSystem = { snapTokenCenter: (x: number, y: number) => ({ x, y }) };
  const controller = new InteractionController(viewport as never, store, gridSystem as never, {} as never, app, false);
  // Sprites stand where their tokens do, as the token renderer keeps them.
  controller.setTokenSpriteProvider((id) => {
    const entry = store.getState().objects.tokens[id];
    if (!entry) return null;
    const position = { x: entry.x, y: entry.y, set: vi.fn() };
    return { position, getChildByLabel: () => null } as never;
  });

  let pressedAt = { x: 0, y: 0 };
  return {
    store,
    rig: new SceneRig(store),
    controller,
    canvas,
    press: (tokenId, modifiers = {}) => {
      const entry = store.getState().objects.tokens[tokenId]!;
      pressedAt = { x: entry.x, y: entry.y };
      controller.handleViewportTokenPointerDown(tokenId, { button: 0, shiftKey: false, altKey: false, ...modifiers, global: pressedAt, stopPropagation: vi.fn() } as never);
    },
    dragTo: (point) => {
      now += 60;
      handlers.get('pointermove')?.({ global: point });
    },
    release: (point) => handlers.get('pointerup')?.({ global: point }),
    at: (tokenId) => {
      const entry = store.getState().objects.tokens[tokenId]!;
      return { x: entry.x, y: entry.y };
    },
  };
}

beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Undo steps the store holds. */
const undoSteps = (store: ViewAtlasStore): number => getHistoryStore(store)!.getState().pastStates.length;

describe('sight on drop', () => {
  it('keeps sight, the seen tokens and explored memory where the drag of a vision token began', () => {
    const { store, rig, press, dragTo, at } = createScene([hero(), token('goblin', RIGHT_CORNER)]);
    expect(rig.sight.origins).toEqual([LEFT_ROOM]);
    expect(rig.seen('goblin')).toBe(false);
    expect(rig.explored(RIGHT_CORNER)).toBe(false);
    const rebuilds = rig.rebuilds;

    press('hero');
    dragTo({ x: 400, y: 300 });
    dragTo({ x: 600, y: 300 });
    dragTo({ x: 800, y: 500 });
    dragTo(RIGHT_ROOM);

    // The token itself follows the pointer; rulers, snapping and the players' picture read it.
    expect(at('hero')).toEqual(RIGHT_ROOM);
    expect(store.getState().heldTokens).toEqual({ hero: LEFT_ROOM });
    expect(rig.sight.origins).toEqual([LEFT_ROOM]);
    expect(rig.seen('goblin')).toBe(false);
    expect(rig.seen('hero')).toBe(true);
    expect(rig.explored(RIGHT_CORNER)).toBe(false);
    // Sight is not worked out again while the token is dragged.
    expect(rig.rebuilds).toBe(rebuilds);
  });

  it('updates once when the token is dropped', () => {
    const { store, rig, press, dragTo, release } = createScene([hero(), token('goblin', RIGHT_CORNER)]);
    press('hero');
    dragTo({ x: 400, y: 300 });
    dragTo(RIGHT_ROOM);
    const rebuilds = rig.rebuilds;
    const recorded = rig.recorded.length;

    release(RIGHT_ROOM);

    expect(store.getState().heldTokens).toEqual({});
    expect(rig.sight.origins).toEqual([RIGHT_ROOM]);
    expect(rig.seen('goblin')).toBe(true);
    expect(rig.explored(RIGHT_CORNER)).toBe(true);
    expect(rig.rebuilds).toBe(rebuilds + 1);
    expect(rig.recorded).toHaveLength(recorded + 1);
  });

  it('works out nothing for a press that selects a vision token without dragging it', () => {
    const { store, rig, press, release } = createScene([hero()]);
    const rebuilds = rig.rebuilds;
    press('hero');
    expect(store.getState().heldTokens).toEqual({ hero: LEFT_ROOM });
    release(LEFT_ROOM);
    expect(store.getState().heldTokens).toEqual({});
    expect(rig.rebuilds).toBe(rebuilds);
  });

  it('changes nothing when the drag is cancelled: the token is put back and let go', () => {
    const { store, rig, press, dragTo } = createScene([hero(), token('goblin', RIGHT_CORNER)]);
    const polygon = rig.sight.polygons[0];
    press('hero');
    dragTo(RIGHT_ROOM);

    store.getState().setTokenPositions([{ id: 'hero', ...LEFT_ROOM }]);
    holdTokens(store, []);

    expect(rig.sight.origins).toEqual([LEFT_ROOM]);
    expect(rig.sight.polygons[0]).toBe(polygon);
    expect(rig.seen('goblin')).toBe(false);
    expect(rig.explored(RIGHT_CORNER)).toBe(false);
  });

  it('lets go of the tokens when the view is torn down in the middle of a drag', () => {
    const { store, controller, press, dragTo } = createScene([hero()]);
    press('hero');
    dragTo(RIGHT_ROOM);
    controller.destroyAll();
    expect(store.getState().heldTokens).toEqual({});
  });

  it.each(['pointercancel', 'blur'] as const)('drops the token where it is when the pointer is lost (%s)', (lost) => {
    const { store, rig, controller, canvas, press, dragTo, at } = createScene([hero()]);
    const steps = undoSteps(store);
    press('hero');
    dragTo({ x: 400, y: 300 });
    dragTo(RIGHT_ROOM);

    if (lost === 'blur') window.dispatchEvent(new Event('blur'));
    else canvas.dispatchEvent(new Event('pointercancel'));

    expect(controller.isDraggingTokens()).toBe(false);
    expect(store.getState().isDragging).toBe(false);
    expect(store.getState().heldTokens).toEqual({});
    expect(at('hero')).toEqual(RIGHT_ROOM);
    expect(rig.sight.origins).toEqual([RIGHT_ROOM]);
    // The move is one undo step, and its transaction is closed: the next write is a step of its own.
    expect(undoSteps(store)).toBe(steps + 1);
    store.getState().moveToken('hero', 720, 300);
    expect(undoSteps(store)).toBe(steps + 2);

    // The pointer's release, should it still arrive, finds no drag.
    window.dispatchEvent(new Event('blur'));
    canvas.dispatchEvent(new Event('pointercancel'));
    expect(at('hero')).toEqual({ x: 720, y: 300 });
  });

  it('lets go of a token that was only pressed when the pointer is lost', () => {
    const { store, controller, canvas, press } = createScene([hero()]);
    const steps = undoSteps(store);
    press('hero');
    canvas.dispatchEvent(new Event('pointercancel'));
    expect(controller.isDraggingTokens()).toBe(false);
    expect(store.getState().heldTokens).toEqual({});
    expect(undoSteps(store)).toBe(steps);
  });

  it('ignores a second press while a drag is running', () => {
    const { store, rig, press, dragTo, release, at } = createScene([hero()]);
    const steps = undoSteps(store);
    press('hero');
    dragTo({ x: 400, y: 300 });

    // A second touch on the dragged token.
    press('hero');
    expect(store.getState().heldTokens).toEqual({ hero: LEFT_ROOM });
    dragTo(RIGHT_ROOM);
    expect(rig.sight.origins).toEqual([LEFT_ROOM]);
    release(RIGHT_ROOM);

    expect(at('hero')).toEqual(RIGHT_ROOM);
    expect(rig.sight.origins).toEqual([RIGHT_ROOM]);
    expect(undoSteps(store)).toBe(steps + 1);
    store.getState().moveToken('hero', 720, 300);
    expect(undoSteps(store)).toBe(steps + 2);
  });

  it('holds every vision token of a group drag, and moves the others as they go', () => {
    const scout = token('scout', { x: 200, y: 400 }, { vision: { enabled: true } });
    const mule = token('mule', { x: 300, y: 300 });
    const { store, rig, press, dragTo, release, at } = createScene([hero(), scout, mule]);
    store.getState().setSelection(['hero', 'scout', 'mule']);
    const rebuilds = rig.rebuilds;

    press('hero');
    dragTo({ x: 450, y: 300 });
    dragTo(RIGHT_ROOM);

    expect(at('scout')).toEqual({ x: 700, y: 400 });
    expect(at('mule')).toEqual({ x: 800, y: 300 });
    expect(rig.sight.origins).toEqual([LEFT_ROOM, { x: 200, y: 400 }]);
    expect(rig.explored(RIGHT_CORNER)).toBe(false);
    // The token that neither sees nor carries a light is held for the lighting too: nothing is built.
    expect(rig.rebuilds).toBe(rebuilds);

    release(RIGHT_ROOM);
    expect(rig.sight.origins).toEqual([RIGHT_ROOM, { x: 700, y: 400 }]);
    expect(rig.explored(RIGHT_CORNER)).toBe(true);
    expect(rig.rebuilds).toBe(rebuilds + 1);
  });

  it('shows and hides a dragged token without vision by the sight that stays as it is', () => {
    const { rig, press, dragTo, release } = createScene([hero(), token('goblin', RIGHT_CORNER)]);
    const polygon = rig.sight.polygons[0];
    const rebuilds = rig.rebuilds;
    expect(rig.seen('goblin')).toBe(false);

    press('goblin');
    dragTo({ x: 300, y: 200 });
    expect(rig.seen('goblin')).toBe(true);
    dragTo({ x: 900, y: 550 });
    expect(rig.seen('goblin')).toBe(false);
    // Its drag builds nothing: the lighting reads it where it was taken.
    expect(rig.rebuilds).toBe(rebuilds);
    release({ x: 300, y: 200 });

    expect(rig.seen('goblin')).toBe(true);
    expect(rig.sight.polygons[0]).toBe(polygon);
  });

  it('follows the drag in a scene that does not wait for the drop: one that says nothing, as by default, or says no', () => {
    for (const sightOnDrop of [undefined, false]) {
      const { store, rig, press, dragTo } = createScene([hero(), token('goblin', RIGHT_CORNER)], { sightOnDrop });
      expect('sightOnDrop' in store.getState().lighting).toBe(sightOnDrop === false);
      press('hero');
      dragTo({ x: 400, y: 300 });
      expect(rig.sight.origins).toEqual([{ x: 400, y: 300 }]);
      dragTo(RIGHT_ROOM);
      expect(rig.sight.origins).toEqual([RIGHT_ROOM]);
      expect(rig.seen('goblin')).toBe(true);
      expect(rig.explored(RIGHT_CORNER)).toBe(true);
    }
  });

  it('follows at once when the option is switched off in the middle of a drag', () => {
    const { store, rig, press, dragTo } = createScene([hero()]);
    press('hero');
    dragTo(RIGHT_ROOM);
    expect(rig.sight.origins).toEqual([LEFT_ROOM]);
    store.getState().setSceneLighting({ sightOnDrop: false });
    expect(rig.sight.origins).toEqual([RIGHT_ROOM]);
  });

  it('updates sight at once when the move is undone and redone', () => {
    const { store, rig, press, dragTo, release, at } = createScene([hero()]);
    press('hero');
    dragTo({ x: 400, y: 300 });
    dragTo(RIGHT_ROOM);
    release(RIGHT_ROOM);
    expect(rig.sight.origins).toEqual([RIGHT_ROOM]);

    const history = getHistoryStore(store)!.getState();
    history.undo();
    expect(at('hero')).toEqual(LEFT_ROOM);
    expect(rig.sight.origins).toEqual([LEFT_ROOM]);
    history.redo();
    expect(rig.sight.origins).toEqual([RIGHT_ROOM]);
  });

  it('updates at once for moves that are not drags', () => {
    const { store, rig } = createScene([hero()]);
    store.getState().setTokenPositions([{ id: 'hero', x: 400, y: 300 }]);
    expect(rig.sight.origins).toEqual([{ x: 400, y: 300 }]);
    store.getState().moveTokensBulk(['hero'], 70, 0);
    expect(rig.sight.origins).toEqual([{ x: 470, y: 300 }]);
    store.getState().moveToken('hero', RIGHT_ROOM.x, RIGHT_ROOM.y);
    expect(rig.sight.origins).toEqual([RIGHT_ROOM]);
  });

  it('leaves the light a vision token carries where the drag began, and moves it on the drop', () => {
    const { rig, press, dragTo, release } = createScene([hero({ light: TORCH }), token('goblin', RIGHT_CORNER)], { ambient: 0 });
    expect(rig.lightsAt).toEqual([{ key: 'token:hero', ...LEFT_ROOM }]);
    const reach = rig.reaches[0];
    expect(rig.explored({ x: 250, y: 300 })).toBe(true);

    press('hero');
    dragTo({ x: 600, y: 300 });
    dragTo(RIGHT_ROOM);
    expect(rig.lightsAt).toEqual([{ key: 'token:hero', ...LEFT_ROOM }]);
    expect(rig.reaches[0]).toBe(reach);
    // Nothing along the way is lit, so nothing along the way is seen or remembered.
    expect(rig.explored({ x: 750, y: 300 })).toBe(false);

    release(RIGHT_ROOM);
    expect(rig.lightsAt).toEqual([{ key: 'token:hero', ...RIGHT_ROOM }]);
    expect(rig.explored({ x: 750, y: 300 })).toBe(true);
  });

  it('leaves the light of a dragged token without vision where the drag began, too', () => {
    // The bearer walks through the doorway, in the hero's line of sight all the way.
    const { rig, press, dragTo, release, at } = createScene([hero(), token('bearer', { x: 350, y: 300 }, { light: TORCH })], { ambient: 0 });
    const reach = rig.reaches[0];
    const rebuilds = rig.rebuilds;
    expect(rig.explored({ x: 650, y: 300 })).toBe(false);

    press('bearer');
    dragTo({ x: 500, y: 300 });
    dragTo(RIGHT_ROOM);
    expect(at('bearer')).toEqual(RIGHT_ROOM);
    expect(rig.lightsAt).toEqual([{ key: 'token:bearer', x: 350, y: 300 }]);
    expect(rig.reaches[0]).toBe(reach);
    expect(rig.explored({ x: 650, y: 300 })).toBe(false);
    expect(rig.rebuilds).toBe(rebuilds);
    // Out of its light, which stayed behind, the bearer is not seen in the dark.
    expect(rig.seen('bearer')).toBe(false);

    release(RIGHT_ROOM);
    expect(rig.lightsAt).toEqual([{ key: 'token:bearer', ...RIGHT_ROOM }]);
    expect(rig.explored({ x: 650, y: 300 })).toBe(true);
    expect(rig.seen('bearer')).toBe(true);
    expect(rig.rebuilds).toBe(rebuilds + 1);
  });

  it('moves a dragged token\'s light as it goes when the scene switches sight on drop off', () => {
    const { rig, press, dragTo } = createScene([hero(), token('bearer', { x: 350, y: 300 }, { light: TORCH })], { ambient: 0, sightOnDrop: false });
    press('bearer');
    dragTo(RIGHT_ROOM);
    expect(rig.lightsAt).toEqual([{ key: 'token:bearer', ...RIGHT_ROOM }]);
    expect(rig.explored({ x: 650, y: 300 })).toBe(true);
  });

  it('hides a dragged vision token from the players where its old sight does not reach, until the drop', () => {
    const { rig, press, dragTo, release } = createScene([hero()]);
    press('hero');
    expect(rig.seen('hero')).toBe(true);
    // Through the doorway, in line of sight of where it stood.
    dragTo(RIGHT_ROOM);
    expect(rig.seen('hero')).toBe(true);
    // Round the corner: the players' picture is dark there, and the token goes with its nameplate and bars.
    dragTo(RIGHT_CORNER);
    expect(rig.seen('hero')).toBe(false);
    release(RIGHT_CORNER);
    expect(rig.seen('hero')).toBe(true);
  });

  it('shows a dragged vision token in the dark wherever its old sight reaches, as when it stands', () => {
    const { rig, press, dragTo } = createScene([hero()], { ambient: 0 });
    expect(rig.seen('hero')).toBe(true);
    press('hero');
    dragTo({ x: 300, y: 200 });
    expect(rig.seen('hero')).toBe(true);
    dragTo(RIGHT_CORNER);
    expect(rig.seen('hero')).toBe(false);
  });

  it('always shows a dragged vision token when the scene switches sight on drop off', () => {
    const { rig, press, dragTo } = createScene([hero()], { sightOnDrop: false });
    press('hero');
    dragTo(RIGHT_CORNER);
    expect(rig.seen('hero')).toBe(true);
  });

  it('turns a carried directional light with its token, and keeps it where the drag began while the token is dragged', () => {
    const lantern: LightEmission = { ...TORCH, bright: 10, dim: 20, angle: 90 };
    const { store, rig, press, dragTo, release } = createScene([hero({ light: lantern, rotation: 90 })], { ambient: 0 });
    const lit = (point: { x: number; y: number }): boolean => pointInPolygon(point, rig.reaches[0]!.polygon);
    // Turned right (rotation 90), 100 px ahead is lit and 100 px behind is not.
    expect(rig.reaches[0]!.cone).toMatchObject({ facing: 0, angle: Math.PI / 2 });
    expect([lit({ x: 300, y: 300 }), lit({ x: 100, y: 300 })]).toEqual([true, false]);
    store.getState().updateToken('hero', { rotation: 270 });
    expect(rig.reaches[0]!.cone!.facing).toBeCloseTo(Math.PI);
    expect([lit({ x: 300, y: 300 }), lit({ x: 100, y: 300 })]).toEqual([false, true]);
    // Dragged, its light stays where the drag began, still turned as the token is; a turn meanwhile is followed at once.
    press('hero');
    dragTo({ x: 600, y: 300 });
    dragTo(RIGHT_ROOM);
    expect(rig.lightsAt).toEqual([{ key: 'token:hero', ...LEFT_ROOM }]);
    expect(lit({ x: 100, y: 300 })).toBe(true);
    store.getState().updateToken('hero', { rotation: 90 });
    expect(rig.lightsAt).toEqual([{ key: 'token:hero', ...LEFT_ROOM }]);
    expect([lit({ x: 300, y: 300 }), lit({ x: 100, y: 300 })]).toEqual([true, false]);
    release(RIGHT_ROOM);
    expect(rig.lightsAt).toEqual([{ key: 'token:hero', ...RIGHT_ROOM }]);
    expect(lit({ x: 800, y: 300 })).toBe(true);
  });

  it('applies changes to a held token other than its place at once', () => {
    const { store, rig, press, dragTo } = createScene([hero()]);
    press('hero');
    dragTo(RIGHT_ROOM);
    store.getState().updateToken('hero', { vision: { enabled: false } });
    expect(rig.sight.all).toBe(true);
    store.getState().updateToken('hero', { vision: { enabled: true }, light: TORCH });
    expect(rig.sight.origins).toEqual([LEFT_ROOM]);
    expect(rig.lightsAt).toEqual([{ key: 'token:hero', ...LEFT_ROOM }]);
  });

  it('holds the copies an Alt-drag carries away, which then see from where they were made', () => {
    const { store, rig, press, dragTo, release } = createScene([hero()]);
    press('hero', { altKey: true });
    dragTo({ x: 400, y: 300 });
    dragTo(RIGHT_ROOM);

    const copyId = Object.keys(store.getState().objects.tokens).find((id) => id !== 'hero')!;
    expect(Object.keys(store.getState().heldTokens)).toEqual([copyId]);
    expect(rig.sight.origins).toEqual([LEFT_ROOM, LEFT_ROOM]);
    expect(rig.explored(RIGHT_CORNER)).toBe(false);

    release(RIGHT_ROOM);
    expect(rig.sight.origins).toEqual([LEFT_ROOM, RIGHT_ROOM]);
  });
});

describe('holdTokens', () => {
  it('keeps the place a token was first held at while it stays held', () => {
    const { store } = createScene([hero(), token('goblin', RIGHT_CORNER)]);
    holdTokens(store, ['hero']);
    store.getState().setTokenPositions([{ id: 'hero', x: 400, y: 300 }]);
    holdTokens(store, ['hero', 'goblin', 'gone']);
    expect(store.getState().heldTokens).toEqual({ hero: LEFT_ROOM, goblin: RIGHT_CORNER });
    holdTokens(store, ['goblin']);
    expect(store.getState().heldTokens).toEqual({ goblin: RIGHT_CORNER });
  });

  it('writes nothing when the held tokens stay the same', () => {
    const { store } = createScene([hero()]);
    const listener = vi.fn();
    store.subscribe(listener);
    holdTokens(store, []);
    holdTokens(store, ['hero']);
    holdTokens(store, ['hero']);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is never an undo step and is not saved with the scene', () => {
    const { store } = createScene([hero()]);
    const history = getHistoryStore(store)!.getState();
    holdTokens(store, ['hero']);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(history.pastStates.length);
    store.setState({ persistenceEnabled: true });
    expect(store.persist.getOptions().partialize?.(store.getState())).not.toHaveProperty('heldTokens');
  });
});
