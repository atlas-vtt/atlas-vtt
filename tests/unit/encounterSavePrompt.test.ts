// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { saveEncounter, type EncounterTokenDraft } from '../../src/app/encounters/encounterSaveService';
import type { AssetService } from '../../src/app/services/AssetService';

vi.mock('../../src/app/encounters/encounterThumbnail', () => ({ generateEncounterThumbnail: vi.fn(async () => null) }));

const tokens: EncounterTokenDraft[] = [{ id: 't1', name: 'Goblin', imagePath: 'goblin.webp', size: 1 }];

function services(): { app: never; assetService: AssetService; createEncounter: ReturnType<typeof vi.fn> } {
  const createEncounter = vi.fn(async (data: { name: string }) => ({ id: 'e1', ...data }));
  return { app: {} as never, assetService: { createEncounter } as unknown as AssetService, createEncounter };
}

function nameInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('.atlas-encounter-save-input');
  if (!input) throw new Error('no name field');
  return input;
}

afterEach(() => {
  document.body.empty();
});

it('asks for the name in a dialog that stacks above the asset manager', () => {
  const { app, assetService } = services();
  void saveEncounter(app, assetService, 'default', tokens);

  expect(nameInput().closest('.atlas-text-dialog-backdrop')).not.toBeNull();
});

it('saves under the name typed when Enter is pressed', async () => {
  const { app, assetService, createEncounter } = services();
  const saving = saveEncounter(app, assetService, 'default', tokens);

  const input = nameInput();
  input.value = 'Goblin ambush';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await saving;

  expect(createEncounter).toHaveBeenCalledWith(expect.objectContaining({ name: 'Goblin ambush', collection: 'default' }));
  expect(document.querySelector('.atlas-text-dialog-backdrop')).toBeNull();
});

it('cancels with Escape without the key reaching the asset manager behind it', async () => {
  const { app, assetService, createEncounter } = services();
  const behind = vi.fn();
  document.addEventListener('keydown', behind);
  const saving = saveEncounter(app, assetService, 'default', tokens);

  nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.removeEventListener('keydown', behind);

  expect(await saving).toBeNull();
  expect(createEncounter).not.toHaveBeenCalled();
  expect(behind).not.toHaveBeenCalled();
});
