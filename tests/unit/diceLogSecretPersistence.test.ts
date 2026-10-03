import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { DiceRollResult } from '../../src/app/tools/DiceTool';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const PATH = 'maps/secret-dice.atlasmap';

function entry(overrides: Partial<DiceRollResult> = {}): DiceRollResult {
  return {
    id: 'roll_1', timestamp: 1, formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }],
    modifiers: 0, total: 13, ...overrides,
  };
}

/** Saves a map holding `log` and opens it again in a new view. */
async function saveAndReopen(log: DiceRollResult[]): Promise<DiceRollResult[]> {
  const { app, files } = createInMemoryApp();
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  const store = createViewAtlasStore(app, 'dice-log-save');
  store.setState({ mapPath: PATH, mapLoaded: true });
  for (const roll of [...log].reverse()) store.getState().addDiceLogEntry(roll);
  await (store as typeof store & { flushStorage: () => Promise<void> }).flushStorage();
  await waitFor(() => expect(files.has(getDataFilePath(PATH))).toBe(true));

  const reopened = createViewAtlasStore(app, 'dice-log-load');
  reopened.getState().setPersistenceEnabled(false);
  reopened.getState().setMapPath(PATH);
  await reopened.persist.rehydrate();
  return reopened.getState().diceLog;
}

describe('the dice log in a map file', () => {
  it('keeps the secret flag of an entry through save and load', async () => {
    const [loaded] = await saveAndReopen([entry({ secret: true })]);
    expect(loaded?.secret).toBe(true);
  });

  it('loads an entry saved without the flag exactly as it was saved', async () => {
    const older = entry();
    const [loaded] = await saveAndReopen([older]);
    expect(loaded).toEqual(older);
  });
});
