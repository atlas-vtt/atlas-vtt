import { describe, expect, it } from 'vitest';
import { NORMAL_SIGHT, GENERIC_SENSES } from '../../gameSystems/senses';
import type { SenseDefinition } from '../../types/senseTypes';
import { recorded } from './recordedShapes';
import { ambientAt, lightLevelAt } from '../lightLevels';
import { lightReach, type AmbientLight, type Sight, type SightRegion } from '../sight';

const rect = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
/** A cave (dark) in a daylight scene, with a lit hall (dusk) inside it. */
const cave = { polygon: rect(100, 100, 400, 300), ambient: 0 };
const hall = { polygon: rect(200, 150, 100, 100), ambient: 0.5 };
const day: AmbientLight = { ambient: 1, zones: [cave, hall] };

describe('ambient zones in the rule', () => {
  it('give a point the ambient light of the topmost zone that contains it, else the scene\'s', () => {
    expect(ambientAt({ x: 50, y: 50 }, day)).toBe(1);
    expect(ambientAt({ x: 150, y: 350 }, day)).toBe(0);
    expect(ambientAt({ x: 250, y: 200 }, day)).toBe(0.5);
    // Later zones lie over earlier ones.
    expect(ambientAt({ x: 250, y: 200 }, { ambient: 1, zones: [hall, cave] })).toBe(0);
    expect(ambientAt({ x: 250, y: 200 }, { ambient: 0.3 })).toBe(0.3);
  });

  it('decide the light level by the zone: dark in the cave by day, dim in its hall, bright outside', () => {
    expect(lightLevelAt({ x: 50, y: 50 }, day, [])).toBe('bright');
    expect(lightLevelAt({ x: 150, y: 350 }, day, [])).toBe('dark');
    expect(lightLevelAt({ x: 250, y: 200 }, day, [])).toBe('dim');
  });

  it('end exactly at the polygon: a point just outside has the scene\'s light', () => {
    expect(lightLevelAt({ x: 100.5, y: 200 }, day, [])).toBe('dark');
    expect(lightLevelAt({ x: 99.5, y: 200 }, day, [])).toBe('bright');
  });

  it('light a zone of a dark scene, and a torch still lights a dark zone', () => {
    const night: AmbientLight = { ambient: 0, zones: [{ polygon: rect(0, 0, 100, 100), ambient: 1 }] };
    expect(lightLevelAt({ x: 50, y: 50 }, night, [])).toBe('bright');
    expect(lightLevelAt({ x: 150, y: 50 }, night, [])).toBe('dark');
    const torch = lightReach({ x: 150, y: 350 }, 100, [], 50);
    expect(lightLevelAt({ x: 150, y: 350 }, day, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 150, y: 270 }, day, [torch])).toBe('dim');
  });

  it('are swallowed by magical darkness like the scene\'s ambient light', () => {
    const night: AmbientLight = { ambient: 0, zones: [{ polygon: rect(0, 0, 100, 100), ambient: 1 }] };
    const darkness = lightReach({ x: 50, y: 50 }, 30, [], 0, { darkness: true });
    expect(lightLevelAt({ x: 50, y: 50 }, night, [darkness])).toBe('magical-dark');
    expect(lightLevelAt({ x: 90, y: 90 }, night, [darkness])).toBe('bright');
  });

  it('decide as before in a scene without zones, also with an empty list', () => {
    expect(lightLevelAt({ x: 50, y: 50 }, { ambient: 0.5, zones: [] }, [])).toBe('dim');
    expect(lightLevelAt({ x: 50, y: 50 }, { ambient: 0.5 }, [])).toBe('dim');
  });
});

describe('explored memory with ambient zones', () => {
  const generic = (id: string): SenseDefinition => GENERIC_SENSES.find((sense) => sense.id === id)!;
  const region = (sense: SenseDefinition, polygon: SightRegion['polygon']): SightRegion => ({ tokenId: 't', sense, origin: { x: 0, y: 0 }, radius: 10, polygon, apex: 0, seesInvisible: sense.seesInvisible });
  const eyes = region(NORMAL_SIGHT, rect(0, 0, 600, 500));
  const darkvision = region(generic('darkvision'), rect(0, 0, 60, 60));
  const sight: Sight = { all: false, regions: [eyes, darkvision] };
  const torch = lightReach({ x: 150, y: 350 }, 100, [], 50);

  it('records what the eyes see where the ambient light is lit: the scene without its dark zones, with the lights in them', () => {
    expect(recorded(sight, day, [torch])).toEqual({
      polygons: [torch.polygon, darkvision.polygon],
      clip: [eyes.polygon, darkvision.polygon],
      ambient: { base: true, zones: [{ polygon: cave.polygon, lit: false }, { polygon: hall.polygon, lit: true }] },
    });
  });

  it('records a lit zone of a dark scene', () => {
    const lit = { polygon: rect(0, 0, 100, 100), ambient: 1 };
    expect(recorded(sight, { ambient: 0, zones: [lit] }, [])).toEqual({
      polygons: [darkvision.polygon],
      clip: [eyes.polygon, darkvision.polygon],
      ambient: { base: false, zones: [{ polygon: lit.polygon, lit: true }] },
    });
  });

  it('leaves the ambient light out for tokens that see nothing by light', () => {
    const blind: Sight = { all: false, regions: [darkvision].map((r) => ({ ...r, sense: { ...r.sense, sees: { ...r.sense.sees, bright: 'none', dim: 'none' } } as SenseDefinition })) };
    expect(recorded(blind, day, [torch])?.ambient).toBeUndefined();
  });

  it('keeps a darkness source\'s area out of the memory in a scene with zones too, unless a sense sees in it', () => {
    const darkness = lightReach({ x: 300, y: 250 }, 120, [], 0, { darkness: true });
    expect(recorded(sight, day, [torch, darkness])).toMatchObject({
      polygons: [torch.polygon, darkvision.polygon],
      except: { areas: [darkness.polygon], unless: [] },
    });
    const truesight = region(generic('truesight'), rect(0, 0, 400, 400));
    expect(recorded({ all: false, regions: [eyes, truesight] }, day, [darkness])?.except).toEqual({ areas: [darkness.polygon], unless: [truesight.polygon] });
    expect(recorded(sight, day, [torch])).not.toHaveProperty('except');
  });

  it('records as before without zones', () => {
    expect(recorded(sight, { ambient: 1, zones: [] }, [torch])).toEqual({ polygons: [eyes.polygon, darkvision.polygon], clip: null });
  });
});
