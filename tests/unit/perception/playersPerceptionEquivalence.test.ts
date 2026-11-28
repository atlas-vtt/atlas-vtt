import { describe, expect, it } from 'vitest';
import { fogCoverage, type FogCoverage } from '../../../src/app/fog/fogCoverage';
import { resolveMeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { heldForSight } from '../../../src/app/lighting/sightOnDrop';
import { mapLayerSourceOf, pictureBasisOf, type MapLayerSource } from '../../../src/app/online/gm/atlasMapLayers';
import type { SceneState } from '../../../src/app/online/gm/atlasView';
import { EyesSight } from '../../../src/app/online/gm/eyesSight';
import { FloorSight } from '../../../src/app/online/gm/floorSight';
import type { MapCanvas } from '../../../src/app/online/gm/mapView';
import { ReadablePins } from '../../../src/app/online/gm/pins/ReadablePins';
import { canvasSightSource, PlayersPerception } from '../../../src/app/perception/playersPerception';
import { playerTokenSight } from '../../../src/app/pixi/lighting/playerLightingLayers';
import { PlayerSightTokens, type PlayerSightHost } from '../../../src/app/pixi/token-renderer/PlayerSightTokens';
import { mapTokens } from '../../../src/app/tokens/offMap';
import type { NotePin, TokenEntity } from '../../../src/app/types';
import type { Point } from '../../../src/app/types/visionTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { perceptionOptions } from '../../../src/app/vision/perception';
import { SceneModelBuilder } from '../../../src/app/vision/sceneModel';
import { GENERIC_SIGHT_RULES } from '../../../src/app/vision/sightRules';
import { PerceptionMemo } from '../../../src/app/vision/tokenPerception';
import { ownPolicy, PLAYER_SIGHT_POLICY, type SightPolicy } from '../../../src/app/vision/tokenSightPolicy';
import { mapLayerSourceOf as formerLayers, pictureBasisOf as formerBasis } from '../../oracles/playersPerceptionBaseline/atlasMapLayers';
import { EyesSight as FormerEyes } from '../../oracles/playersPerceptionBaseline/eyesSight';
import { FloorSight as FormerFloorSight } from '../../oracles/playersPerceptionBaseline/floorSight';
import type { MapCanvas as FormerCanvas } from '../../oracles/playersPerceptionBaseline/mapView';
import { playerRollTokens as formerRollTokens, playersSeeMapAt as formerPlaces } from '../../oracles/playersPerceptionBaseline/orchestratorSight';
import { PlayerSightTokens as FormerSightTokens } from '../../oracles/playersPerceptionBaseline/PlayerSightTokens';
import { ReadablePins as FormerPins } from '../../oracles/playersPerceptionBaseline/ReadablePins';
import { GENERIC_SOURCE } from '../online/gm/gmLighting';
import { sceneState } from '../online/gm/shareHarness';

/*
 * The equivalence check of the move of the players' perception into one module: over generated scenes of two floors,
 * every place that told what players see (the canvas's `playerRollTokens` and `playersSeeMapAt`, the table's map layers
 * of the GM's canvas, each player's own eyes on the canvas and on the floor worked out on the CPU, the readable pins)
 * is asked in its former code (`tests/oracles/playersPerceptionBaseline/`) and through the module, and must answer alike.
 * Every layer is compared for the party and for one player's own eyes, on the canvas and on the CPU; the one change
 * made on purpose (`namedChange`) is allowed as exactly that change.
 */

const MAP = { width: 1000, height: 600 };
const SCENES = 30;
const VIEW = { app: {}, serviceManager: { getAssetService: () => null, getToolController: () => null, getEventBus: () => { throw new Error('no bus'); } } };

function seeded(seed: number): () => number {
  return (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

/** A scene of two floors, the upper under a roof: walls and a door on each, tokens with and without senses, some hidden, fog patches and readable pins. */
function generate(random: () => number): SceneState {
  const at = (): { x: number; y: number } => ({ x: Math.round(40 + random() * 920), y: Math.round(40 + random() * 520) });
  const tokens: Record<string, TokenEntity> = {};
  const walls: Record<string, WallSegment> = {};
  const pins: Record<string, NotePin> = {};
  const fog: SceneState['objects']['fog'] = {};
  for (const level of ['ground', 'upper'] as const) {
    const on = level === 'upper' ? { level } : {};
    for (let n = 0; n < 2 + Math.floor(random() * 4); n++) {
      const party = n === 0 || random() < 0.3;
      const senses = [[], [{ id: 'darkvision', range: 30 }], [{ id: 'tremorsense', range: 20 }]][Math.floor(random() * 3)]!;
      tokens[`${level}${n}`] = { id: `${level}${n}`, kind: party ? 'character' : 'token', name: `${level}${n}`, imagePath: `art/${level}${n}.webp`, size: 1, ...at(), ...on, isHidden: !party && random() < 0.25, ...(party && { vision: { enabled: true, senses } }) } as TokenEntity;
    }
    walls[`wall${level}`] = { id: `wall${level}`, kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 250 }, ...on } as WallSegment;
    walls[`door${level}`] = { id: `door${level}`, kind: 'wall', type: 'door', closed: random() < 0.5, p1: { x: 500, y: 250 }, p2: { x: 500, y: 350 }, ...on } as WallSegment;
    walls[`loose${level}`] = { id: `loose${level}`, kind: 'wall', type: 'solid', p1: at(), p2: at(), ...on } as WallSegment;
    for (let n = 0; n < 3; n++) pins[`pin${level}${n}`] = { id: `pin${level}${n}`, kind: 'pin', ...at(), notePath: `Notes/pin${n}.md`, readable: true, ...on } as NotePin;
    if (random() < 0.6) fog[`fog${level}`] = { id: `fog${level}`, kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', ...at(), width: 220, height: 180, ...on } as SceneState['objects']['fog'][string];
  }
  const base = sceneState({ levels: [{ id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null }, { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null, foreground: 'art/roof.webp' }], lighting: { enabled: random() < 0.8, ambient: [0, 0.4, 1][Math.floor(random() * 3)]! } });
  return { ...base, objects: { ...base.objects, tokens, walls, pins, fog } };
}

/** The layers a set of eyes is told, by the names the comparison reports them under. */
type Told = Record<string, unknown>;

/** What a set of eyes is told of the floor through the map layers `layers` and the tokens `shown`. */
function toldBy(name: string, layers: MapLayerSource, shown: ReadonlyMap<string, unknown>, seen: unknown, walls: Readonly<Record<string, WallSegment>>, points: readonly Point[], fog: FogCoverage | null, tokens: Readonly<Record<string, TokenEntity>>): Told {
  const doors = layers.doorsSeen(walls, fog);
  return {
    [`${name} tokens`]: [...shown.keys()].sort(),
    [`${name} doors`]: doors && [...doors].sort(),
    [`${name} places`]: layers.pointsSeen(points, fog),
    [`${name} sensed`]: layers.sensed(tokens),
    [`${name} sightParts`]: layers.sightParts?.() ?? null,
    [`${name} seen`]: seen,
  };
}

/** What every place that tells what players see answers of `state` now, layer by layer, in its former code or through the module. */
function answers(state: SceneState, former: boolean, current: boolean, roof: ((point: { x: number; y: number }) => boolean) | null, readable: boolean): Told {
  const objects = levelObjects(state);
  const tokens = mapTokens(objects);
  const pinPoints = Object.values(objects.pins ?? {}).map(({ x, y }) => ({ x, y }));
  let fog: FogCoverage | null;
  try {
    fog = readable ? fogCoverage(objects.fog) : null;
  } catch {
    fog = null;
  }
  const model = new SceneModelBuilder().update(state, MAP, () => resolveMeasurementSettings(undefined, null), () => GENERIC_SIGHT_RULES).model;
  // As Atlas's lighting view: its sight is always the scene's while the scene is unlit.
  const renderer = { isEnabled: () => state.lighting.enabled, sightIsCurrent: () => !state.lighting.enabled || current, currentSight: () => model.sight, ambientLight: () => model.ambient, lightReaches: () => model.reaches };
  const memo = new PerceptionMemo();
  const lighting = { renderer, sightAids: GENERIC_SOURCE, playerSight: () => playerTokenSight(renderer, tokens, perceptionOptions(GENERIC_SIGHT_RULES, heldForSight(state)), memo) };
  const sprites = Object.fromEntries(Object.values(tokens).map((token) => [token.id, { x: token.x, y: token.y, tokenSize: 70 }]));
  const host = { tokens: () => tokens, sprites: () => sprites, held: () => new Set<string>(), showsPlayers: () => false } as unknown as PlayerSightHost;
  const frame = former ? new FormerSightTokens(host) : new PlayerSightTokens(host);
  frame.setFogProvider(() => fog);
  if (roof !== null) frame.setRoofProvider(roof);
  const tokenRenderer = { getTokenSprites: () => sprites, playerFramePerception: (lit?: Parameters<PlayerSightTokens['framePerception']>[0]) => frame.framePerception(lit) };
  const own: SightPolicy = ownPolicy((token) => token.id.endsWith('0'), (token) => token.id.endsWith('0'));
  const floor = { state: () => state, rules: () => GENERIC_SIGHT_RULES };
  const ports = { state: () => state, map: () => MAP, lightingSource: () => GENERIC_SOURCE, cell: () => 70 };
  const mapPath = state.mapPath!;
  const told = (name: string, layers: MapLayerSource, shown: ReadonlyMap<string, unknown>, seen: unknown): Told => toldBy(name, layers, shown, seen, objects.walls, pinPoints, fog, tokens);
  if (former) {
    const canvas = { getGridOptions: () => ({ size: 70 }), getLightingController: () => lighting, getTokenRenderer: () => tokenRenderer } as unknown as FormerCanvas;
    const view = { fogRenderer: { getCommittedCoverage: () => fog }, lighting, tokenRenderer, store: { getState: () => state } };
    const layers = formerLayers(canvas, VIEW as never);
    const cpu = new FormerFloorSight(ports);
    const [cpuParty, canvasOwn, cpuOwn] = [new FormerEyes(PLAYER_SIGHT_POLICY, floor), new FormerEyes(own, floor), new FormerEyes(own, floor)];
    const cpuLayers = cpuParty.layers(cpu, layers);
    return {
      rolls: [...formerRollTokens(view, mapPath).keys()].sort(), pinsOnCanvas: formerPlaces(view, pinPoints),
      ...told('canvas party', layers, formerRollTokens(view, mapPath), null),
      ...told('canvas own', canvasOwn.layers(formerBasis(canvas)!, layers), canvasOwn.tokens(formerBasis(canvas)!, canvas).playerRollTokens(mapPath), canvasOwn.seen(formerBasis(canvas)!)),
      ...told('cpu party', cpuLayers, cpuParty.tokens(cpu, canvas).playerRollTokens(mapPath), cpuParty.seen(cpu)),
      ...told('cpu own', cpuOwn.layers(cpu, layers), cpuOwn.tokens(cpu, canvas).playerRollTokens(mapPath), cpuOwn.seen(cpu)),
      'canvas pins': new FormerPins(() => 'x').listed(state, { lit: state.lighting.enabled, fog, seen: (points) => layers.pointsSeen(points, fog) })?.map(({ pin }) => pin.id),
      'cpu pins': new FormerPins(() => 'x').listed(state, { lit: state.lighting.enabled, fog, seen: (points) => cpuLayers.pointsSeen(points, fog) })?.map(({ pin }) => pin.id),
    };
  }
  const source = canvasSightSource({ lighting: () => lighting, tokens: () => tokenRenderer });
  const party = new PlayersPerception(PLAYER_SIGHT_POLICY, floor);
  const canvas = { getGridOptions: () => ({ size: 70 }), getLightingController: () => lighting, getTokenRenderer: () => tokenRenderer, sightSource: () => source, playersPerception: () => party } as unknown as MapCanvas;
  const layers = mapLayerSourceOf(canvas, VIEW as never);
  const cpu = new FloorSight(ports);
  const [cpuParty, canvasOwn, cpuOwn] = [new EyesSight(PLAYER_SIGHT_POLICY, floor), new EyesSight(own, floor), new EyesSight(own, floor)];
  const cpuLayers = cpuParty.layers(cpu, layers);
  return {
    rolls: [...party.shown(source, mapPath).keys()].sort(), pinsOnCanvas: party.places(source, pinPoints, fog),
    ...told('canvas party', layers, party.shown(source, mapPath), null),
    ...told('canvas own', canvasOwn.layers(pictureBasisOf(canvas)!, layers), canvasOwn.tokens(pictureBasisOf(canvas)!, canvas).playerRollTokens(mapPath), canvasOwn.seen(pictureBasisOf(canvas)!)),
    ...told('cpu party', cpuLayers, cpuParty.tokens(cpu, canvas).playerRollTokens(mapPath), cpuParty.seen(cpu)),
    ...told('cpu own', cpuOwn.layers(cpu, layers), cpuOwn.tokens(cpu, canvas).playerRollTokens(mapPath), cpuOwn.seen(cpu)),
    'canvas pins': new ReadablePins(() => 'x').listed(state, (points) => layers.pointsSeen(points, fog))?.map(({ pin }) => pin.id),
    'cpu pins': new ReadablePins(() => 'x').listed(state, (points) => cpuLayers.pointsSeen(points, fog))?.map(({ pin }) => pin.id),
  };
}

/**
 * The one change the move makes on purpose: the map layers' places of an unlit scene, which nobody asked before
 * (null), answer by the fog rule now, since the readable pins, which applied that rule themselves, ask them.
 */
function namedChange(layer: string, state: SceneState, before: unknown, after: unknown, points: readonly Point[], fog: FogCoverage | null): boolean {
  return layer.endsWith(' places') && !state.lighting.enabled && before === null && JSON.stringify(after) === JSON.stringify(points.map((point) => fog !== null && !fog.covers(point)));
}

describe('the players\' perception moved into one module', () => {
  it(`answers as every place that told what players see did (${SCENES} generated scenes of two floors)`, () => {
    let cases = 0;
    const differences: string[] = [];
    const layers: Record<string, { cases: number; differences: number; named: number }> = {};
    for (let seed = 1; seed <= SCENES; seed++) {
      const generated = generate(seeded(seed));
      const party = Object.values(generated.objects.tokens).find((token) => token.vision?.enabled === true)!;
      const held = { ...generated, lighting: { ...generated.lighting, sightOnDrop: true }, heldTokens: { [party.id]: { x: party.x, y: party.y } }, objects: { ...generated.objects, tokens: { ...generated.objects.tokens, [party.id]: { ...party, x: 950 - party.x } } } };
      for (const scene of [generated, held]) {
        for (const viewedLevel of ['ground', 'upper']) {
          const state = { ...scene, viewedLevel };
          for (const current of [true, false]) {
            for (const roof of [null, (point: { x: number; y: number }) => point.x > 600]) {
              for (const readable of [true, false]) {
                cases += 1;
                const before = answers(state, true, current, roof, readable);
                const after = answers(state, false, current, roof, readable);
                const objects = levelObjects(state);
                let fog: FogCoverage | null;
                try {
                  fog = readable ? fogCoverage(objects.fog) : null;
                } catch {
                  fog = null;
                }
                const points = Object.values(objects.pins ?? {}).map(({ x, y }) => ({ x, y }));
                for (const layer of Object.keys(before)) {
                  const tally = (layers[layer] ??= { cases: 0, differences: 0, named: 0 });
                  tally.cases += 1;
                  if (JSON.stringify(before[layer]) === JSON.stringify(after[layer])) continue;
                  if (namedChange(layer, state, before[layer], after[layer], points, fog)) tally.named += 1;
                  else {
                    tally.differences += 1;
                    differences.push(`seed ${seed} ${viewedLevel} current=${current} roof=${roof !== null} fog=${readable} ${layer}: ${JSON.stringify(before[layer])} | ${JSON.stringify(after[layer])}`);
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(cases).toBe(SCENES * 2 * 2 * 2 * 2 * 2);
    expect(differences).toEqual([]);
    // Each layer's cases, differences and named changes, for the record; the named change shows in the places alone.
    expect(Object.keys(layers).filter((layer) => layers[layer]!.named > 0).every((layer) => layer.endsWith(' places'))).toBe(true);
    expect(layers).toMatchSnapshot();
  });
});
