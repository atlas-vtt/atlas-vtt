import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CreateCollectionModal } from '../../src/app/packages/components/asset-manager/CreateCollectionModal';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const opened: App[] = [];

afterEach(() => {
  cleanup();
  for (const app of opened.splice(0)) SystemPresetFiles.release(app);
  vi.restoreAllMocks();
});

function setup(existingNames: string[] = []) {
  const { app, files } = createInMemoryApp();
  app.workspace = { getLeavesOfType: () => [], trigger: vi.fn() } as any;
  const settings = new SettingsService(app);
  const presets = SystemPresetFiles.open(app);
  opened.push(app);
  const stored: Record<string, Record<string, unknown>> = {};
  const assets = {
    createCollection: vi.fn(async (name: string) => {
      stored[name] = { conditions: [] };
      return { id: name, name };
    }),
    updateCollectionSettings: vi.fn(async (id: string, update: Record<string, unknown>) => {
      stored[id] = { ...stored[id], ...update };
    }),
    getCollectionSettings: (id: string) => stored[id] ?? { conditions: [] },
    getCollectionForMap: () => null,
  };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets as any);
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(
    <AtlasUIContext.Provider value={{ app } as never}>
      <CreateCollectionModal existingNames={existingNames} onClose={onClose} onCreated={onCreated} />
    </AtlasUIContext.Provider>,
  );
  return { assets, stored, settings, presets, files, onCreated, onClose };
}

const radio = (name: string): HTMLElement => screen.getByRole('radio', { name: new RegExp(`^${name}`) });

describe('CreateCollectionModal', () => {
  it('creates a collection with a built-in system, its widgets and its resources', async () => {
    const { stored, onCreated, onClose } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Gloomhollow' } });
    fireEvent.click(radio('Shadowdark'));
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Gloomhollow'));
    expect(onClose).toHaveBeenCalled();
    expect(stored.Gloomhollow).toMatchObject({
      systemPresetId: 'builtin:shadowdark',
      resources: [{ key: 'hp' }],
      widgets: { 'shadowdark-torch': { label: 'Torch' } },
    });
  });

  it('starts Daggerheart collections with HP and Stress', async () => {
    const { stored, onCreated } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Age of Umbra' } });
    fireEvent.click(radio('Daggerheart'));
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(stored['Age of Umbra']).toMatchObject({ resources: [{ key: 'hp' }, { key: 'stress' }] });
  });

  it('refuses a name another collection has', () => {
    const { assets } = setup(['Gloomhollow']);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'gloomhollow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    expect(screen.getByRole('alert').textContent).toBe('A collection named "gloomhollow" already exists');
    expect(assets.createCollection).not.toHaveBeenCalled();
  });

  it('sets up a new game system, saves it as a preset and starts the collection with it', async () => {
    const { stored, presets, files, onCreated } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Homebrew Hills' } });
    fireEvent.click(radio('Create your own'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('New game system')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a name');

    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Hills Rules' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Condition/ }));
    fireEvent.change(screen.getByPlaceholderText('Condition name'), { target: { value: 'Muddy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Homebrew Hills'));
    await presets.flush();
    const saved = presets.entries();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Hills Rules', rules: { conditions: [{ name: 'Muddy' }] } });
    expect(JSON.parse(files.get('atlas-vtt/system-presets/Hills Rules.json')!)).toMatchObject({ format: 1, id: saved[0]!.id, name: 'Hills Rules' });
    expect(stored['Homebrew Hills']).toMatchObject({ systemPresetId: saved[0]!.id, conditions: [{ name: 'Muddy' }] });
  });

  it('creates no game system while its distance per square is no distance', async () => {
    const { presets, onCreated } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Homebrew Hills' } });
    fireEvent.click(radio('Create your own'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Hills Rules' } });
    const distance = screen.getByDisplayValue<HTMLInputElement>('5');

    fireEvent.change(distance, { target: { value: 'far' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    // Creating starts by saving the preset, in the click itself.
    expect(presets.entries()).toHaveLength(0);

    fireEvent.change(distance, { target: { value: '1,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Homebrew Hills'));
  });

  it('goes back from the setup to the name and system', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(radio('Create your own'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // The header arrow and the footer button both go back; use the footer one.
    fireEvent.click(screen.getAllByRole('button', { name: 'Back' }).at(-1)!);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('X');
  });
});
