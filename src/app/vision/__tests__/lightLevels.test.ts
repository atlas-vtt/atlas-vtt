import { describe, expect, it } from 'vitest';
import { ambientLevel, lightLevelAt } from '../lightLevels';
import { perceivedLevel } from '../../gameSystems/senseRules';
import { NORMAL_SIGHT } from '../../gameSystems/senses';
import { lightReach, type AmbientLight, type LightReach } from '../sight';
import { pointInPolygon } from '../visibility';
import type { WallSegment } from '../../types/wallTypes';

const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };
/** A torch at (100, 100): bright to 50 px, dim to 100 px, with a wall 100 px to its right. */
const torch = lightReach({ x: 100, y: 100 }, 100, [wall], 50);
const dark: AmbientLight = { ambient: 0 };

describe('lightReach', () => {
  it('carries the bright radius beside the dim one', () => {
    expect(torch).toMatchObject({ origin: { x: 100, y: 100 }, bright: 50, dim: 100 });
  });

  it('has no bright part when none is given', () => {
    expect(lightReach({ x: 0, y: 0 }, 100, []).bright).toBe(0);
  });
});

describe('ambientLevel', () => {
  it('is dark below the lit threshold, dim from there, bright from the bright threshold', () => {
    expect(ambientLevel({ ambient: 0 })).toBe('dark');
    expect(ambientLevel({ ambient: 0.24 })).toBe('dark');
    expect(ambientLevel({ ambient: 0.25 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.74 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.75 })).toBe('bright');
    expect(ambientLevel({ ambient: 1 })).toBe('bright');
  });

  it('reads the time-of-day presets as the rules do: day bright, dusk dim, night and pitch black dark', () => {
    expect([1, 0.5, 0.15, 0].map((ambient) => ambientLevel({ ambient }))).toEqual(['bright', 'dim', 'dark', 'dark']);
  });

  it('follows the scene\'s own thresholds', () => {
    expect(ambientLevel({ ambient: 0.4, litThreshold: 0.5 })).toBe('dark');
    expect(ambientLevel({ ambient: 0.5, litThreshold: 0.5 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.5, brightThreshold: 0.5 })).toBe('bright');
    expect(ambientLevel({ ambient: 0.8, brightThreshold: 0.9 })).toBe('dim');
    expect(ambientLevel({ ambient: 0.9, litThreshold: 0.9 })).toBe('bright');
    expect(ambientLevel({ ambient: 0, litThreshold: 0 })).toBe('dim');
    expect(ambientLevel({ ambient: 0, litThreshold: 0, brightThreshold: 0 })).toBe('bright');
  });
});

describe('lightLevelAt', () => {
  it('is bright within a light\'s bright radius, dim out to its dim radius, dark beyond', () => {
    expect(lightLevelAt({ x: 100, y: 130 }, dark, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 150 }, dark, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 151 }, dark, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 195 }, dark, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 201 }, dark, [torch])).toBe('dark');
  });

  it('is dark behind a wall, however close the light', () => {
    const lamp = lightReach({ x: 190, y: 100 }, 100, [wall], 50);
    expect(lightLevelAt({ x: 180, y: 100 }, dark, [lamp])).toBe('bright');
    expect(lightLevelAt({ x: 210, y: 100 }, dark, [lamp])).toBe('dark');
    expect(lightLevelAt({ x: 260, y: 100 }, dark, [lamp])).toBe('dark');
  });

  it('is dark without lights in a dark scene', () => {
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [])).toBe('dark');
  });

  it('takes the brightest of the ambient light and every light', () => {
    const candle = lightReach({ x: 100, y: 180 }, 40, [], 10);
    expect(lightLevelAt({ x: 100, y: 185 }, dark, [torch, candle])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 185 }, dark, [candle, torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 165 }, dark, [candle, torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 400 }, { ambient: 0.5 }, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 130 }, { ambient: 0.5 }, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 180 }, { ambient: 0.1 }, [torch])).toBe('dim');
    expect(lightLevelAt({ x: 100, y: 400 }, { ambient: 0.8 }, [torch])).toBe('bright');
    expect(lightLevelAt({ x: 300, y: 100 }, { ambient: 0.8 }, [torch])).toBe('bright');
  });

  it('ends at the dim radius on every side alike, where the picture has faded to nothing', () => {
    // A token one cell from a light of one cell stands exactly on its dim radius.
    const lamp = lightReach({ x: 500, y: 500 }, 70, []);
    const sides = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }];
    for (const side of sides) {
      expect(lightLevelAt({ x: 500 + side.x * 70, y: 500 + side.y * 70 }, dark, [lamp])).toBe('dark');
      expect(lightLevelAt({ x: 500 + side.x * 69, y: 500 + side.y * 69 }, dark, [lamp])).toBe('dim');
    }
  });

  it('ends at the dim radius where snapped centres miss it by a rounding error', () => {
    // Cells of 72.7 px from an offset of 12.3: the next cell's centre lies a hair inside the radius.
    const centre = (cell: number): number => 12.3 + (cell + 0.5) * 72.7;
    const lamp = lightReach({ x: centre(5), y: centre(5) }, 72.7, []);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      expect(lightLevelAt({ x: centre(5 + dx), y: centre(5 + dy) }, dark, [lamp])).toBe('dark');
    }
  });

  it('never reports magical darkness, which only darkness sources will make', () => {
    for (const ambient of [0, 0.5, 1]) {
      for (const y of [100, 180, 500]) expect(lightLevelAt({ x: 100, y }, { ambient }, [torch])).not.toBe('magical-dark');
    }
  });
});

/** Whether a point counted as lit before light levels existed, as `sight.ts` had it. */
function isLitBefore(point: { x: number; y: number }, ambient: AmbientLight, lights: readonly LightReach[]): boolean {
  const threshold = ambient.litThreshold === undefined ? 0.25 : Math.min(1, Math.max(0, ambient.litThreshold));
  if (ambient.ambient >= threshold) return true;
  return lights.some((light) => Math.hypot(point.x - light.origin.x, point.y - light.origin.y) <= light.dim && pointInPolygon(point, light.polygon));
}

describe('what normal sight sees by the light level', () => {
  const points = [{ x: 100, y: 100 }, { x: 100, y: 150 }, { x: 100, y: 151 }, { x: 100, y: 195 }, { x: 100, y: 201 }, { x: 250, y: 100 }, { x: 190, y: 100 }];
  const ambients = [0, 0.05, 0.1, 0.12, 0.125, 0.13, 0.2, 0.24, 0.25, 0.26, 0.5, 0.74, 0.75, 1];
  const thresholds = [undefined, 0, 0.1, 0.5, 1, 7];
  const lit = (point: { x: number; y: number }, scene: AmbientLight, lights: readonly LightReach[]): boolean =>
    perceivedLevel(NORMAL_SIGHT, lightLevelAt(point, scene, lights)) !== null;

  it('is what counted as lit before light levels existed, for every scene', () => {
    for (const lights of [[], [torch], [torch, lightReach({ x: 250, y: 100 }, 30, [wall])]]) {
      for (const litThreshold of thresholds) {
        for (const brightThreshold of [undefined, 0.3, 1]) {
          for (const ambient of ambients) {
            const scene: AmbientLight = { ambient, ...(litThreshold !== undefined && { litThreshold }), ...(brightThreshold !== undefined && { brightThreshold }) };
            for (const point of points) expect(lit(point, scene, lights)).toBe(isLitBefore(point, scene, lights));
          }
        }
      }
    }
  });

  it('is lit from the lit threshold itself', () => {
    expect(lit({ x: 100, y: 400 }, { ambient: 0.1, litThreshold: 0.1 }, [])).toBe(true);
    expect(lit({ x: 100, y: 400 }, { ambient: 0.1 }, [])).toBe(false);
  });
});

describe('magical darkness', () => {
  /** A Darkness of 60 px at (130, 100): it covers the torch's centre and part of its dim range. */
  const darkness = lightReach({ x: 130, y: 100 }, 60, [wall], 0, { darkness: true });
  const day: AmbientLight = { ambient: 1 };

  it('is magically dark inside a darkness source, whatever the ambient light and the lights of its priority or below', () => {
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [torch, darkness])).toBe('magical-dark');
    expect(lightLevelAt({ x: 100, y: 100 }, day, [torch, darkness])).toBe('magical-dark');
    expect(lightLevelAt({ x: 100, y: 100 }, day, [darkness, torch])).toBe('magical-dark');
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [{ ...torch, priority: -1 }, darkness])).toBe('magical-dark');
    expect(lightLevelAt({ x: 189, y: 100 }, day, [darkness])).toBe('magical-dark');
  });

  it('leaves everything outside its radius as it was, and nothing behind a wall is darkened', () => {
    // 40 px left of the torch: 70 px from the darkness.
    expect(lightLevelAt({ x: 60, y: 100 }, dark, [torch, darkness])).toBe('bright');
    expect(lightLevelAt({ x: 20, y: 100 }, dark, [torch, darkness])).toBe('dim');
    expect(lightLevelAt({ x: 20, y: 300 }, day, [torch, darkness])).toBe('bright');
    // 59 px from a darkness that stands 30 px left of the wall, on the wall's other side.
    const atWall = lightReach({ x: 170, y: 100 }, 60, [wall], 0, { darkness: true });
    expect(lightLevelAt({ x: 229, y: 100 }, day, [atWall])).toBe('bright');
    expect(lightLevelAt({ x: 199, y: 100 }, day, [atWall])).toBe('magical-dark');
  });

  it('ends at its radius on every side alike, where its picture swallows nothing', () => {
    const source = lightReach({ x: 500, y: 500 }, 70, [], 0, { darkness: true });
    for (const side of [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }]) {
      expect(lightLevelAt({ x: 500 + side.x * 70, y: 500 + side.y * 70 }, day, [source])).toBe('bright');
      expect(lightLevelAt({ x: 500 + side.x * 69, y: 500 + side.y * 69 }, day, [source])).toBe('magical-dark');
    }
  });

  it('ends at its radius where snapped centres miss it by a rounding error', () => {
    const centre = (cell: number): number => 12.3 + (cell + 0.5) * 72.7;
    const source = lightReach({ x: centre(5), y: centre(5) }, 72.7, [], 0, { darkness: true });
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      expect(lightLevelAt({ x: centre(5 + dx), y: centre(5 + dy) }, day, [source])).toBe('bright');
    }
  });

  it('is no light: a darkness source lights nothing', () => {
    expect(lightLevelAt({ x: 300, y: 300 }, dark, [darkness])).toBe('dark');
    expect(lightLevelAt({ x: 140, y: 100 }, dark, [{ ...darkness, darkness: false }])).toBe('dim');
  });

  it('gives way to a light of higher priority, which lights it at its own level; a tie goes to the darkness', () => {
    const daylight: LightReach = { ...torch, priority: 1 };
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [daylight, darkness])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 160 }, dark, [daylight, darkness])).toBe('dim');
    // Inside the darkness and beyond the daylight's reach: the ambient light stays swallowed.
    const candle: LightReach = { ...lightReach({ x: 180, y: 100 }, 10, [wall], 5), priority: 1 };
    expect(lightLevelAt({ x: 100, y: 100 }, day, [candle, darkness])).toBe('magical-dark');
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [daylight, { ...darkness, priority: 1 }])).toBe('magical-dark');
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [daylight, { ...darkness, priority: 2 }, darkness])).toBe('magical-dark');
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [{ ...torch, priority: 3 }, { ...darkness, priority: 2 }])).toBe('bright');
  });

  it('decides as before for lights without the new fields', () => {
    for (const point of [{ x: 100, y: 130 }, { x: 100, y: 180 }, { x: 260, y: 100 }, { x: 100, y: 400 }]) {
      for (const ambient of [0, 0.5, 1]) {
        expect(lightLevelAt(point, { ambient }, [torch])).toBe(lightLevelAt(point, { ambient }, [{ ...torch, priority: 0, darkness: false }]));
      }
    }
  });
});

describe('a directional light', () => {
  /** A lantern at (100, 100) that shines right, 90° wide: bright to 50 px, dim to 100 px, the wall 100 px to its right. */
  const cone = { facing: 0, angle: Math.PI / 2, apex: 10 };
  const lantern = lightReach({ x: 100, y: 100 }, 100, [wall], 50, { cone });

  it('lights only inside its cone, brightly and dimly by distance, and stops at walls', () => {
    expect(lightLevelAt({ x: 140, y: 100 }, dark, [lantern])).toBe('bright');
    expect(lightLevelAt({ x: 180, y: 100 }, dark, [lantern])).toBe('dim');
    // 30° off its axis is inside, 60° is not; behind it nothing is lit.
    expect(lightLevelAt({ x: 100 + 40 * Math.cos(Math.PI / 6), y: 100 + 40 * Math.sin(Math.PI / 6) }, dark, [lantern])).toBe('bright');
    expect(lightLevelAt({ x: 100 + 40 * Math.cos(Math.PI / 3), y: 100 + 40 * Math.sin(Math.PI / 3) }, dark, [lantern])).toBe('dark');
    expect(lightLevelAt({ x: 60, y: 100 }, dark, [lantern])).toBe('dark');
    expect(lightLevelAt({ x: 100, y: 160 }, dark, [lantern])).toBe('dark');
    expect(lightLevelAt({ x: 230, y: 100 }, dark, [lantern])).toBe('dark');
  });

  it('lights its own space all around, so whoever carries it stands in its light', () => {
    expect(lightLevelAt({ x: 100, y: 100 }, dark, [lantern])).toBe('bright');
    expect(lightLevelAt({ x: 92, y: 100 }, dark, [lantern])).toBe('bright');
    expect(lightLevelAt({ x: 100, y: 108 }, dark, [lantern])).toBe('bright');
    expect(lightLevelAt({ x: 88, y: 100 }, dark, [lantern])).toBe('dark');
  });

  it('turns with its facing', () => {
    const left = lightReach({ x: 100, y: 100 }, 100, [wall], 50, { cone: { ...cone, facing: Math.PI } });
    expect(lightLevelAt({ x: 60, y: 100 }, dark, [left])).toBe('bright');
    expect(lightLevelAt({ x: 140, y: 100 }, dark, [left])).toBe('dark');
  });

  it('is the light it always was without a cone', () => {
    expect(lightReach({ x: 100, y: 100 }, 100, [wall], 50, {})).toEqual(torch);
    expect(torch).not.toHaveProperty('cone');
  });
});

