import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../../../gameSystems/senses';
import type { MeasurementSettings } from '../../../../grid/measurementFormat';
import { LIGHTING_QUALITY, type LightingQuality } from '../../../../lighting/lightingQuality';
import type { TokenEntity } from '../../../../types';
import type { LightEmission } from '../../../../types/lightingTypes';
import type { Point } from '../../../../types/visionTypes';
import type { WallSegment } from '../../../../types/wallTypes';
import { SceneModelBuilder, SceneSpots } from '../../../../vision/sceneModel';
import { LightingEngine } from '../LightingEngine';
import type { LightingMode } from '../compositeFilter';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 256;
const MAP = 1024;
const CELL = 70;
const camera = { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: 0x6699cc };
const bounds = { width: MAP, height: MAP };
const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
const rules = (): { definitions: typeof ALL_SENSES; conditions: [] } => ({ definitions: ALL_SENSES, conditions: [] });
const FEET = { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [] } as unknown as MeasurementSettings;
type SceneState = Parameters<SceneModelBuilder['update']>[0];
type Pixel = readonly [number, number, number];
type Picture = (point: Point) => Pixel;

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
const WALLS = Object.fromEntries([wall('n', 64, 64, 960, 64), wall('e', 960, 64, 960, 960), wall('s', 960, 960, 64, 960), wall('w', 64, 960, 64, 64)].map((w) => [w.id, w]));

/** 5 ft of purple light that outshines magical darkness, as the report had it. */
const PURPLE: LightEmission = { bright: 0, dim: 5, color: '#a040ff', intensity: 1, animation: 'none', priority: 1 };
const DARKNESS: LightEmission = { bright: 0, dim: 60, color: '#000000', intensity: 1, animation: 'none', darkness: true };
const A = { x: 700, y: 512 };
/** In A's light (70 px), up and left of A, where no offset below puts B: 54 px from A and at least 49 px from B, whose footprint reaches 35 px. */
const IN_A_LIGHT = { x: A.x - 38, y: A.y - 38 };

function token(id: string, at: Point, senses: readonly (string | { id: string; range: number })[] = [], light?: LightEmission): TokenEntity {
  return { id, kind: 'token', imagePath: `${id}.png`, ...at, size: 1, vision: { enabled: true, senses: senses.map((sense) => (typeof sense === 'string' ? { id: sense } : sense)) }, ...(light && { light }) } as TokenEntity;
}

function sceneOf(tokens: TokenEntity[], darkness: Point & { dim?: number } = { x: 512, y: 512 }, ambient = 0): SceneState {
  return {
    objects: {
      walls: WALLS,
      lights: { dark: { id: 'dark', kind: 'light', x: darkness.x, y: darkness.y, emission: { ...DARKNESS, dim: darkness.dim ?? DARKNESS.dim } } },
      tokens: Object.fromEntries(tokens.map((t) => [t.id, t])),
    },
    lighting: { enabled: true, ambient },
    grid: { size: CELL },
    heldTokens: {},
  } as unknown as SceneState;
}

/** A with the outshining light and no darkvision, B beside it with 5e darkvision. */
function party(offset: Point, senses = ['dnd5e-darkvision']): TokenEntity[] {
  return [token('a', A, [], PURPLE), token('b', { x: A.x + offset.x, y: A.y + offset.y }, senses)];
}

/** Points deep in the room, clear of both tokens, their footprints and the light. */
const DEEP = Array.from({ length: 7 }, (_, i) => 130 + i * 60).flatMap((x) => Array.from({ length: 12 }, (_, j) => ({ x, y: 120 + j * 66 })));
const luminance = ([r, g, b]: Pixel): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const isBlack = (pixel: Pixel): boolean => pixel.every((channel) => channel <= 1);

function expectDeepBlack(at: Picture): void {
  for (const point of DEEP) expect([point, isBlack(at(point))]).toEqual([point, true]);
}

const QUALITIES: [string, LightingQuality][] = [['high', LIGHTING_QUALITY.high], ['balanced', LIGHTING_QUALITY.balanced], ['saver', LIGHTING_QUALITY.saver]];

describe('a token standing in a light that outshines magical darkness, in the players\' picture', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function picture(state: SceneState, quality: LightingQuality, mode: LightingMode = 'player'): Promise<Picture> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer, quality);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    engine.setEnabled(true);
    engine.setMode(mode);
    const { model } = new SceneModelBuilder().update(state, bounds, () => FEET, rules);
    const spots = new SceneSpots().update(model, state, () => FEET, rules);
    engine.update({ bounds, albedo: null, walls: model.walls, lights: model.lights, sight: model.sight, sightRadius: 31, cellSize: CELL, ambient: state.lighting.ambient, spots });
    engine.flush();
    const at = renderThroughEngine(engine, renderer, camera);
    watch.stop();
    expect(watch.findings).toEqual([]);
    expect(engine.failed).toBe(false);
    return (point) => at(Math.round(point.x * camera.scale), Math.round(point.y * camera.scale));
  }

  describe.each(QUALITIES)('at the %s lighting quality', (_, quality) => {
    // Beside A, on the edge of its light, into it by a hair, a quarter, half a token and on top of it.
    const OFFSETS = [
      ['two cells away', { x: 140, y: 0 }], ['diagonal', { x: CELL, y: CELL }],
      ['adjacent east', { x: CELL, y: 0 }], ['adjacent west', { x: -CELL, y: 0 }], ['adjacent north', { x: 0, y: -CELL }], ['adjacent south', { x: 0, y: CELL }],
      ['overlapping by a hair', { x: CELL - 0.5, y: 0 }], ['overlapping by a quarter', { x: CELL * 0.75, y: 0 }], ['overlapping by half', { x: 0, y: CELL / 2 }], ['on top', { x: 0, y: 0 }],
    ] as const;

    it.each(OFFSETS)('keeps the room of darkness black with a darkvision token %s', async (_name, offset) => {
      const at = await picture(sceneOf(party(offset)), quality);
      expectDeepBlack(at);
      expect(luminance(at(IN_A_LIGHT))).toBeGreaterThan(5);
    });

    it('keeps it black while a token that only has its eyes stands in the light of a lit scene', async () => {
      expectDeepBlack(await picture(sceneOf(party({ x: 35, y: 0 }, []), { x: 512, y: 512 }, 1), quality));
    });

    it('still shows the veil to a darkvision token outside the darkness', async () => {
      // A darkness of 14 ft (196 px) around the party; C looks at it across the room, from outside.
      const outside = token('c', { x: 800, y: 512 }, ['dnd5e-darkvision']);
      const darkness = { x: 300, y: 512, dim: 14 };
      const pocket = [token('a', { x: 300, y: 512 }, [], PURPLE), token('b', { x: 335, y: 512 }, ['dnd5e-darkvision'])];
      const withViewer = await picture(sceneOf([...pocket, outside], darkness), quality);
      const without = await picture(sceneOf(pocket, darkness), quality);
      const inDarkness = { x: 300, y: 620 };
      const [r, , b] = withViewer(inDarkness);
      expect(b).toBeGreaterThan(r + 3);
      expect(luminance(withViewer(inDarkness))).toBeLessThan(14);
      expect(isBlack(without(inDarkness))).toBe(true);
    });

    describe('with one token in the light and another looking at the darkness from outside', () => {
      const DARKNESS_14 = { x: 300, y: 512, dim: 14 };
      const IN_DARKNESS = { x: 300, y: 620 };
      const C_AT = { x: 800, y: 512 };
      const DARKVISION = 'dnd5e-darkvision';
      const SHORT_DARKVISION = { id: DARKVISION, range: 10 };
      const pocket = (senses: readonly string[]): TokenEntity[] => [token('a', { x: 300, y: 512 }, [], PURPLE), token('b', { x: 335, y: 512 }, senses)];

      async function expectVeilWith(viewer: TokenEntity, ambient?: number): Promise<void> {
        const [r, , b] = (await picture(sceneOf([...pocket([DARKVISION]), viewer], DARKNESS_14, ambient), quality))(IN_DARKNESS);
        expect(b).toBeGreaterThan(r + 3);
      }

      it.each([
        ['darkvision', 'only its eyes', [DARKVISION], []],
        ['darkvision', 'darkvision that does not reach', [DARKVISION], [SHORT_DARKVISION]],
        ['only its eyes', 'only its eyes', [], []],
        ['only its eyes', 'darkvision that does not reach', [], [SHORT_DARKVISION]],
      ] as const)('keeps it black with %s in the light and %s outside', async (_inside, _outside, inside, outside) => {
        const at = await picture(sceneOf([...pocket(inside), token('c', C_AT, outside)], DARKNESS_14), quality);
        expect(at(IN_DARKNESS)).toEqual([0, 0, 0]);
      });

      it('shows the veil where the outside token\'s own darkvision reaches, whoever stands in the light', async () => {
        await expectVeilWith(token('c', C_AT, [DARKVISION]));
      });

      it('shows the veil to eyes outside where the darkness swallows the day', async () => {
        await expectVeilWith(token('c', C_AT), 1);
      });
    });

    it('lets a sense that sees in magical darkness see the room from the light as well', async () => {
      const at = await picture(sceneOf(party({ x: 35, y: 0 }, ['dnd5e-devils-sight'])), quality);
      expect(luminance(at({ x: 300, y: 512 }))).toBeGreaterThan(20);
    });

    it('leaves the GM\'s veil as it is', async () => {
      const at = await picture(sceneOf(party({ x: 35, y: 0 })), quality, 'gm');
      const [r, , b] = at({ x: 300, y: 512 });
      expect(b).toBeGreaterThan(r);
      expect(luminance(at({ x: 300, y: 512 }))).toBeGreaterThan(8);
    });
  });
});
