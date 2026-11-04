// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStatblockOverrides } from '../../../../src/app/packages/components/asset-manager/utils/statblockLoader';
import { buildStatblockLinkUpdates } from '../../../../src/app/pixi/token-renderer/statblockFrontmatter';
import { HP_RESOURCE } from '../../../../src/app/resources/resourceDefinitions';
import { resolveField } from '../../../../src/app/resources/resourceFields';
import { fillMissingResources } from '../../../../src/app/resources/statblockResourceSync';
import { startingResources } from '../../../../src/app/resources/statblockResourceValues';
import { TokenStatblockLinkService } from '../../../../src/app/services/TokenStatblockLinkService';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { readStatblock } from '../../../../src/app/statblocks/resolve/readStatblock';
import { addNote, creatureVault, forbidWrites, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_ID, MARSH_PATH, RENAMED_HP } from '../library/templateTexts';

const GUARD = 'Bestiary/Iron Guard.md';
/** A Draw Steel monster: its hit points are its Stamina, its rating its level. */
const IRON_GUARD = { statblock: true, 'atlas-template': 'builtin:draw-steel-monster', name: 'Iron Guard', level: 3, stamina: 40, size: '1M' };
const STAMINA = { 'hit-points': 'stamina' };

let current: CreatureVault;
beforeEach(() => {
  current = creatureVault();
  addNote(current, GUARD, IRON_GUARD);
});
afterEach(() => {
  TemplateLibrary.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
});

const linkService = (): { extractStatblockData: (path: string) => Promise<Record<string, unknown> | null>; readStatblockRecord: TokenStatblockLinkService['readStatblockRecord'] } =>
  Object.assign(Object.create(TokenStatblockLinkService.prototype) as TokenStatblockLinkService, { app: current.app }) as never;

describe('hit points under the key a template means', () => {
  it('reads the hit points a template keeps under another key when a resource asks for hit points', () => {
    expect(resolveField({ stamina: 40 }, 'hp')).toBeUndefined();
    expect(resolveField({ stamina: 40 }, 'hp', STAMINA)).toBe(40);
    expect(startingResources({ stamina: 40 }, [HP_RESOURCE], STAMINA)).toEqual({ hp: { current: 40, max: 40 } });
  });

  it('prefers the meant field over another field that is called hit points', () => {
    expect(resolveField({ stamina: 40, health: 'Hale' }, 'hp', STAMINA)).toBe(40);
    expect(resolveField({ health: 7 }, 'hp', STAMINA)).toBe(7);
  });

  it('keeps the exact key first, and applies meanings only to the record\'s own keys', () => {
    expect(resolveField({ hp: 9, stamina: 40 }, 'hp', STAMINA)).toBe(9);
    expect(resolveField({ resources: { stamina: 4 } }, 'resources.hp', STAMINA)).toBeUndefined();
  });
});

describe('native statblocks reach tokens', () => {
  it('places a token with the hit points and the rating the template means', async () => {
    expect(await loadStatblockOverrides(current.app, GUARD, [HP_RESOURCE])).toEqual({
      name: 'Iron Guard',
      difficulty: 'Level 3',
      resources: { hp: { current: 40, max: 40 } },
    });
  });

  it('places a token with hit points written as a sum that names another number of the statblock', async () => {
    addNote(current, 'Bestiary/Iron Captain.md', { ...IRON_GUARD, name: 'Iron Captain', stamina: '20 + @level' });
    expect((await loadStatblockOverrides(current.app, 'Bestiary/Iron Captain.md', [HP_RESOURCE]))?.resources).toEqual({ hp: { current: 23, max: 23 } });
  });

  it('links a token to a native statblock with the same values, and never writes the note', async () => {
    const refusals = forbidWrites(current.app);
    const data = await linkService().extractStatblockData(GUARD);
    expect(data).toMatchObject({ name: 'Iron Guard', difficulty: 'Level 3', meanings: { 'hit-points': 'stamina', rating: 'level' } });
    expect(await linkService().readStatblockRecord(GUARD)).toMatchObject({ fields: { stamina: 40 }, meanings: STAMINA });
    expect(refusals.every((refusal) => refusal.mock.calls.length === 0)).toBe(true);
  });

  it('links a token on an open map with the same values as on closed maps', async () => {
    const statblock = await linkService().readStatblockRecord(GUARD);
    expect(statblock && buildStatblockLinkUpdates(statblock, 'Hero', [HP_RESOURCE], { mana: { current: 1, max: 4 } })).toEqual({
      name: 'Iron Guard',
      difficulty: 'Level 3',
      resources: { mana: { current: 1, max: 4 }, hp: { current: 40, max: 40 } },
    });
  });

  it('starts a resource defined later from the hit points the template means', async () => {
    const apply = vi.fn();
    const tokens = { guard: { kind: 'character', statblockPath: GUARD } };
    await fillMissingResources({ tokens: () => tokens as never, apply }, [HP_RESOURCE], (path) => linkService().readStatblockRecord(path));
    expect(apply).toHaveBeenCalledWith([{ id: 'guard', changes: { resources: { hp: { current: 40, max: 40 } } } }]);
  });

  it('waits for the library before reading a note whose template is a file in the vault', async () => {
    // The template renamed `hit_points` to `hp`; the library reads its file after the note is asked for
    current.files.set(MARSH_PATH, `${JSON.stringify(RENAMED_HP, null, 2)}\n`);
    addNote(current, 'Bestiary/Warden.md', { statblock: true, 'atlas-template': MARSH_ID, name: 'Warden', hit_points: 22, cr: 2 });
    const statblock = await readStatblock(current.app, 'Bestiary/Warden.md');
    expect(statblock).toMatchObject({ templateStatus: 'ok', lookName: 'Marsh creature', fields: { hp: 22 }, meanings: { rating: 'cr' } });
    expect(await loadStatblockOverrides(current.app, 'Bestiary/Warden.md', [HP_RESOURCE])).toMatchObject({ difficulty: 'CR 2', resources: { hp: { current: 22, max: 22 } } });
  });
});
