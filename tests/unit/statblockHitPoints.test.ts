import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));
const collection = vi.hoisted(() => ({ resources: undefined as unknown }));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({
  getCollectionForMap: () => 'collection',
  getCollectionSettings: () => ({ resources: collection.resources }),
}) } }));

import { rollHitPoints } from '../../src/app/services/statblockHitPoints';
import { AMMO, HP } from '../mocks/resourceFixtures';

interface Roll {
  formula: string;
  source: Record<string, unknown>;
}

/** An open map view with a dice tool that returns `totals` in order, and a store holding `tokenIds`. */
function mapView(totals: number[], tokenIds: string[], isPlayerView = false) {
  const rolls: Roll[] = [];
  const updateTokens = vi.fn();
  const view = {
    serviceManager: { getToolController: () => ({ getDiceTool: () => ({
      rollDice: (formula: string, source: Record<string, unknown>) => {
        rolls.push({ formula, source });
        return { formula, total: totals[rolls.length - 1] ?? 0 };
      },
    }) }) },
    getStore: () => ({ getState: () => ({
      isPlayerView,
      mapPath: 'maps/cave.atlasmap',
      objects: { tokens: Object.fromEntries(tokenIds.map((id) => [id, { id }])) },
      updateTokens,
    }) }),
  };
  return { view, rolls, updateTokens };
}

const appWith = (...views: unknown[]) => ({ workspace: { getLeavesOfType: () => views.map((view) => ({ view })) } }) as never;

describe('rollHitPoints', () => {
  beforeEach(() => { collection.resources = [HP]; });

  it('rolls once per token and puts each at full health with its own result', () => {
    const { view, rolls, updateTokens } = mapView([9, 4], ['a', 'b']);
    rollHitPoints(appWith(view), '2d6', 'Goblin.md', [
      { id: 'a', name: 'Goblin' },
      { id: 'b', name: 'Goblin' },
    ], 'Hit Points');

    expect(rolls.map((roll) => [roll.formula, roll.source.tokenId, roll.source.abilityName]))
      .toEqual([['2d6', 'a', 'Hit Points'], ['2d6', 'b', 'Hit Points']]);
    expect(updateTokens).toHaveBeenCalledOnce();
    expect(updateTokens).toHaveBeenCalledWith([
      { id: 'a', changes: { resources: { hp: { current: 9, max: 9 } }, overriddenMax: ['hp'] } },
      { id: 'b', changes: { resources: { hp: { current: 4, max: 4 } }, overriddenMax: ['hp'] } },
    ]);
  });

  it('rolls and updates only the named view when both contain the same token', () => {
    const first = mapView([2], ['a']);
    const second = mapView([9], ['a']);
    const app = appWith({ ...first.view, viewId: 'first' }, { ...second.view, viewId: 'second' });
    rollHitPoints(app, '2d6', 'Goblin.md', [{ id: 'a' }], 'Hit Points', 'second');
    expect(first.rolls).toEqual([]);
    expect(first.updateTokens).not.toHaveBeenCalled();
    expect(second.rolls).toHaveLength(1);
    expect(second.updateTokens).toHaveBeenCalledWith([
      { id: 'a', changes: { resources: { hp: { current: 9, max: 9 } }, overriddenMax: ['hp'] } },
    ]);
  });

  it('never rolls a creature below 1 hit point', () => {
    const { view, updateTokens } = mapView([-1], ['a']);
    rollHitPoints(appWith(view), '1d4-3', 'Rat.md', [{ id: 'a' }]);
    expect(updateTokens).toHaveBeenCalledWith([{ id: 'a', changes: { resources: { hp: { current: 1, max: 1 } }, overriddenMax: ['hp'] } }]);
  });

  it('writes to the game master view, never a player view of the same map', () => {
    const player = mapView([], ['a'], true);
    const gm = mapView([6], ['a']);
    rollHitPoints(appWith(player.view, gm.view), '2d6', 'Goblin.md', [{ id: 'a' }]);
    expect(player.updateTokens).not.toHaveBeenCalled();
    expect(gm.updateTokens).toHaveBeenCalledOnce();
  });

  it('is an ordinary roll when no placed token is linked', () => {
    const { view, rolls, updateTokens } = mapView([8], ['other']);
    rollHitPoints(appWith(view), '2d6', 'Goblin.md', [{ name: 'Goblin' }]);
    rollHitPoints(appWith(view), '2d6', 'Goblin.md', [{ id: 'not-on-this-map' }]);
    expect(rolls).toHaveLength(2);
    expect(rolls[0]!.source).toEqual({ type: 'statblock', statblockPath: 'Goblin.md' });
    expect(updateTokens).not.toHaveBeenCalled();
  });

  it('sets the resource the collection reads from the hit points field, whatever its key', () => {
    collection.resources = [AMMO, { ...HP, key: 'vitality', name: 'Vitality', field: 'Hit Points' }];
    const { view, updateTokens } = mapView([6], ['a']);
    rollHitPoints(appWith(view), '2d6', 'Goblin.md', [{ id: 'a' }]);
    expect(updateTokens).toHaveBeenCalledWith([{ id: 'a', changes: { resources: { vitality: { current: 6, max: 6 } }, overriddenMax: ['vitality'] } }]);
  });

  it('is an ordinary roll when the collection tracks no hit points', () => {
    collection.resources = [AMMO];
    const { view, rolls, updateTokens } = mapView([6], ['a']);
    rollHitPoints(appWith(view), '2d6', 'Goblin.md', [{ id: 'a' }]);
    expect(rolls[0]!.source).toEqual({ type: 'statblock', statblockPath: 'Goblin.md' });
    expect(updateTokens).not.toHaveBeenCalled();
  });
});
