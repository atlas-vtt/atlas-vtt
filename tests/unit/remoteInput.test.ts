import { describe, expect, it } from 'vitest';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { checkedPlayer, checkedScene, MAX_REMOTE_MAP_SIDE } from '../../src/app/remote-view/remoteInput';
import { remoteScene } from './remoteSceneFixtures';

const player = (fields: Record<string, unknown> = {}): unknown => ({
  movableTokenIds: ['t1'], measurement: resolveMeasurementSettings(undefined, null),
  tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} }, ...fields,
});

describe("what a remote view takes from its owner", () => {
  it('takes a well-formed scene, or null', () => {
    expect(checkedScene(null)).toBeNull();
    expect(checkedScene(remoteScene())).not.toBeNull();
  });

  it('refuses map sizes and URLs the viewport or the textures cannot take', () => {
    const bad = [
      { ...remoteScene(), background: { url: 3, width: 10, height: 10 } },
      { ...remoteScene(), background: { url: null, width: Infinity, height: 10 } },
      { ...remoteScene(), background: { url: null, width: -1, height: 10 } },
      { ...remoteScene(), background: { url: null, width: MAX_REMOTE_MAP_SIDE + 1, height: 10 } },
      { ...remoteScene(), tokenImages: { t1: 7 } },
      { ...remoteScene(), tokenImages: { t1: 'Art/goblin.png' } },
      { ...remoteScene(), background: { url: 'Maps/cave.png', width: 10, height: 10 } },
      { ...remoteScene(), background: { url: 'file:///etc/cave.png', width: 10, height: 10 } },
      { ...remoteScene(), objects: { tokens: {} } },
    ];
    for (const scene of bad) expect(() => checkedScene(scene)).toThrow(/RemoteView.setScene/);
  });

  it('refuses a grid that would never finish drawing or that Atlas does not know, before anything is stored', () => {
    const grid = remoteScene().grid!;
    const bad = [
      { ...grid, size: -1 }, { ...grid, size: 0 }, { ...grid, size: 0.0001 }, { ...grid, size: Number.NaN },
      { ...grid, size: 1 }, // 1000 cells per side on this map is fine; on a 100,000 px map it is not
      { ...grid, offsetX: Infinity }, { ...grid, size: 38.52, offsetX: 5.53816e87 }, { ...grid, type: 'triangle' }, { ...grid, lineType: 'wavy' }, 'square',
    ];
    const wide = { url: null, width: MAX_REMOTE_MAP_SIDE, height: 800 };
    for (const value of bad) expect(() => checkedScene({ ...remoteScene(), background: wide, grid: value })).toThrow(/RemoteView.setScene: .*grid/);
    expect(checkedScene({ ...remoteScene(), grid: { ...grid, size: 50 }, background: wide })).not.toBeNull();
    expect(checkedScene({ ...remoteScene(), grid: null })).not.toBeNull();
    expect(checkedScene({ ...remoteScene(), grid: { enabled: true, size: 70, unitType: 'custom' } as never })).not.toBeNull();
  });

  it('copies a well-formed player state, frozen', () => {
    const state = checkedPlayer(player());
    expect(Object.isFrozen(state.measurement)).toBe(true);
  });

  it('takes a measurement without ruleDistance, as an extension written for 1.13 sends it, measuring squares like cells', () => {
    const { ruleDistance: _rule, ...older } = resolveMeasurementSettings(undefined, { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1, measurementType: 'units', unitDistance: 10 });
    expect(checkedPlayer(player({ measurement: older })).measurement).toMatchObject({ unitDistance: 10, ruleDistance: 10 });
    const scene = resolveMeasurementSettings({ measurementMode: 'metric', unitType: 'feet', unitDistance: 5 } as never, { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1, unitDistanceOverride: 10 });
    expect(checkedPlayer(player({ measurement: scene })).measurement).toMatchObject({ unitDistance: 10, ruleDistance: 5 });
    expect(() => checkedPlayer(player({ measurement: { ...scene, ruleDistance: 0 } }))).toThrow(/RemoteView.setPlayer/);
  });

  it('refuses a measurement the ruler cannot use, and malformed ids, definitions and health', () => {
    const measurement = resolveMeasurementSettings(undefined, null);
    const bad = [
      player({ measurement: { ...measurement, unitDistance: 0 } }),
      player({ measurement: { ...measurement, coneAngle: 720 } }),
      player({ measurement: { ...measurement, mode: 'furlongs' } }),
      player({ measurement: { ...measurement, rangeBands: [{ name: 'Near', maxSquares: Number.NaN }] } }),
      player({ movableTokenIds: [1] }),
      player({ tokenUi: { conditions: [{ id: 'x' }], resources: {} } }),
      player({ tokenUi: { conditions: [], resources: { t1: [{ key: 'hp' }] } } }),
      player({ initiative: { rules: null, health: { t1: { value: 'full', max: 1 } } } }),
    ];
    for (const state of bad) expect(() => checkedPlayer(state)).toThrow(/RemoteView.setPlayer/);
  });
});
