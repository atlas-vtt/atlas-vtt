// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';
import { AssetService } from '../../src/app/services/AssetService';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { memoryPresets } from '../mocks/memoryPresets';

const dialogs = vi.hoisted(() => ({ confirmAction: vi.fn() }));
vi.mock('../../src/app/ui/confirmDialog', () => ({ confirmAction: dialogs.confirmAction }));
// Sharp map pictures come from the map tile worker, which a test without a browser has not.
vi.mock('../../src/app/react/components/dashboard/mapPicture', () => ({ mapPictureUrl: () => Promise.resolve(null), releaseMapPictures: () => undefined }));

import { Dashboard } from '../../src/app/react/components/dashboard/Dashboard';

const SCENE_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const DAY = 24 * 60 * 60 * 1000;

const PARTY_TOKENS = {
  t1: { imagePath: 'art/aria.webp', ringColor: '#aa3300' },
  t2: { imagePath: 'art/olm.webp' },
  t3: { imagePath: 'art/brom.webp' },
  t4: { imagePath: 'art/finn.webp' },
};

/**
 * A vault with one scene and one map, and the campaigns in memory. With `party`, the scene holds
 * three player characters (Aria and Finn ringed, Brom without a ring) and an olm.
 */
async function renderDashboard(
  initial: StoredCampaign[] | ((sceneId: string) => StoredCampaign[]) = [],
  { party = false }: { party?: boolean } = {},
): Promise<{ app: App; storage: ReturnType<typeof memoryCampaigns>; mapId: string }> {
  const tokens = party ? PARTY_TOKENS : {};
  const { app } = createInMemoryApp({
    files: {
      [SCENE_PATH]: JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: SCENE_PATH, objects: { tokens } } }),
      'atlas-vtt/assets/keep.webp': 'WEBP',
      ...(party && { 'art/aria.webp': 'WEBP', 'art/olm.webp': 'WEBP', 'art/brom.webp': 'WEBP', 'art/finn.webp': 'WEBP' }),
    },
  });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const map = await assets.addAsset({ type: 'map', name: 'Keep', mapFilePath: 'atlas-vtt/assets/keep.webp', tags: [], collection: 'c' });
  if (party) {
    await assets.addAssets([
      { type: 'token', name: 'Aria', imagePath: 'art/aria.webp', tags: [], collection: 'c', playerCharacter: true },
      { type: 'token', name: 'Olm', imagePath: 'art/olm.webp', tags: [], collection: 'c' },
      { type: 'token', name: 'Brom', imagePath: 'art/brom.webp', tags: [], collection: 'c', playerCharacter: true, showRing: false },
      { type: 'token', name: 'Finn', imagePath: 'art/finn.webp', tags: [], collection: 'c', playerCharacter: true },
    ]);
  }
  const [scene] = await assets.getAssets(undefined, 'scene');
  const storage = memoryCampaigns(typeof initial === 'function' ? initial(scene!.id) : initial);
  render(<Dashboard app={app} campaignStorage={storage} onOpenScene={vi.fn()} onCreateMap={vi.fn()} onOpenAssetManager={vi.fn()} />);
  await screen.findAllByText('Cave');
  return { app, storage, mapId: map.id };
}

const nameField = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Campaign name' });
const cardNames = (): string[] => [...document.querySelectorAll('.campaign-card:not(.campaign-card--new) .dashboard-card__title')].map((name) => name.textContent ?? '');
const stored = (storage: ReturnType<typeof memoryCampaigns>, name: string): StoredCampaign | undefined => storage.current().find((entry) => entry.name === name);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  AssetService.resetInstance();
});

describe('the campaigns on the dashboard', () => {
  it('starts with the card that makes the first campaign, which opens its page', async () => {
    const { storage } = await renderDashboard();
    expect(cardNames()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Enter a name');
    expect(storage.current()).toEqual([]);

    fireEvent.change(nameField(), { target: { value: '  The Witherwild ' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    expect(stored(storage, 'The Witherwild')).toBeTruthy();
    expect(nameField().value).toBe('The Witherwild');
    expect(screen.getByText('Created just now')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByRole('button', { name: /The Witherwild/ })).toBeTruthy();
  });

  it('cancels a new campaign with Escape, and names a taken name while it is typed', async () => {
    const { storage } = await renderDashboard([{ id: 'a', name: 'Cairn', createdAt: Date.now() - 3 * DAY }]);
    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fireEvent.change(nameField(), { target: { value: 'cairn' } });
    expect(screen.getByRole('alert').textContent).toBe('Another campaign has this name.');
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(storage.current()).toHaveLength(1);

    fireEvent.keyDown(nameField(), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Campaign name' })).toBeNull();
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeTruthy();
  });

  it('shows campaigns as cards, the most recently played first, with when and the game system', async () => {
    await renderDashboard([
      { id: 'a', name: 'Cairn', createdAt: Date.now() - 10 * DAY, system: { systemPresetId: 'builtin:cairn', gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [] } },
      { id: 'b', name: 'Witherwild', createdAt: Date.now() - 20 * DAY, lastPlayed: Date.now() - 2 * DAY, nextSession: '2026-10-18' },
    ]);
    const cards = within(screen.getByRole('region', { name: 'Campaigns' })).getAllByRole('button').filter((button) => button.matches('.campaign-card:not(.campaign-card--new)'));
    expect(cardNames()).toEqual(['Witherwild', 'Cairn']);
    expect(cards[0]!.textContent).toContain('Last played 2d ago');
    // A day of a next session older versions kept is no longer shown.
    expect(cards[0]!.textContent).not.toContain('Next session');
    expect(cards[1]!.textContent).toContain('Created 10d ago');
    expect(cards[1]!.querySelector('.dashboard-card__system')?.textContent).toBe('Cairn');
  });

  it('follows campaigns renamed, added and deleted elsewhere', async () => {
    const { storage } = await renderDashboard([{ id: 'a', name: 'Cairn', createdAt: 1 }]);
    act(() => storage.update('a', (entry) => ({ ...entry, name: 'Cairn: Blue Mouth Caves' })));
    expect(screen.getByRole('button', { name: /Cairn: Blue Mouth Caves/ })).toBeTruthy();
    act(() => storage.create({ id: 'b', name: 'Dolmenwood', createdAt: 2 }));
    expect(screen.getByRole('button', { name: /Dolmenwood/ })).toBeTruthy();
    act(() => storage.remove('a'));
    expect(screen.queryByRole('button', { name: /Cairn/ })).toBeNull();
  });
});

describe('a campaign\'s page', () => {
  async function openPage(initial: StoredCampaign[], name: string): Promise<Awaited<ReturnType<typeof renderDashboard>>> {
    const result = await renderDashboard(initial);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    await waitFor(() => expect(nameField().value).toBe(name));
    return result;
  }

  it('renames in place, keeps a taken name from being saved and reverts on Escape', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }, { id: 'b', name: 'Dolmenwood', createdAt: 2 }], 'Cairn');
    fireEvent.focus(nameField());
    fireEvent.change(nameField(), { target: { value: 'Dolmenwood' } });
    expect(screen.getByRole('alert').textContent).toBe('Another campaign has this name.');
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(stored(storage, 'Cairn')).toBeTruthy();

    fireEvent.change(nameField(), { target: { value: 'Cairn: Blue Mouth Caves' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(nameField(), { key: 'Escape' });
    fireEvent.blur(nameField());
    expect(nameField().value).toBe('Cairn');
    expect(stored(storage, 'Cairn')).toBeTruthy();

    fireEvent.focus(nameField());
    fireEvent.change(nameField(), { target: { value: 'Cairn: Blue Mouth Caves' } });
    fireEvent.blur(nameField());
    expect(storage.current().find((entry) => entry.id === 'a')?.name).toBe('Cairn: Blue Mouth Caves');
  });

  it('saves the description on leaving it, and has no next session to set', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }], 'Cairn');
    const description = screen.getByRole('textbox', { name: 'Description' });
    fireEvent.focus(description);
    fireEvent.change(description, { target: { value: 'The olms rise.' } });
    expect(storage.current()[0]!.description).toBeUndefined();
    fireEvent.blur(description);
    expect(storage.current()[0]!.description).toBe('The olms rise.');

    expect(screen.queryByLabelText('Next session')).toBeNull();
  });

  it('takes any map or scene of the library as its world map, changes and removes it', async () => {
    const { storage, mapId } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }], 'Cairn');
    const choose = await screen.findByRole('button', { name: 'Choose a world map' });
    await waitFor(() => {
      if (!choose.getAttribute('aria-expanded')?.includes('true')) fireEvent.click(choose);
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['CaveScene', 'KeepMap']);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search maps and scenes' }), { target: { value: 'kee' } });
    fireEvent.click(screen.getByRole('option', { name: /Keep/ }));
    expect(storage.current()[0]!.worldMap).toBe(mapId);
    // A plain map says that a press makes it a scene, where pins can be placed.
    expect(screen.getByRole('button', { name: 'Make it a scene to place pins Keep' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Change World map' }));
    fireEvent.click(screen.getByRole('option', { name: /Cave/ }));
    expect(storage.current()[0]!.worldMap).not.toBe(mapId);
    expect(screen.getByRole('button', { name: 'Place pins Cave' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove world map' }));
    expect(storage.current()[0]!.worldMap).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Choose a world map' })).toBeTruthy();
  });

  it('deletes the campaign only once the GM confirms, saying what stays', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }], 'Cairn');
    dialogs.confirmAction.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }));
    await waitFor(() => expect(dialogs.confirmAction).toHaveBeenCalledTimes(1));
    expect(storage.current()).toHaveLength(1);
    expect(dialogs.confirmAction.mock.calls[0]![0]).toMatchObject({
      title: 'Delete Cairn?',
      message: ['The scenes, maps and tokens it used stay in your library.'],
      destructive: true,
    });

    dialogs.confirmAction.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }));
    await waitFor(() => expect(storage.current()).toHaveLength(0));
    expect(cardNames()).toEqual([]);
  });

  it('shows changes made elsewhere and returns to the dashboard when the campaign is deleted there', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }], 'Cairn');
    act(() => storage.update('a', (entry) => ({ ...entry, name: 'Cairn: Blue Mouth Caves', description: 'Written on the laptop.' })));
    expect(nameField().value).toBe('Cairn: Blue Mouth Caves');
    expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Written on the laptop.');

    act(() => storage.remove('a'));
    expect(screen.queryByRole('textbox', { name: 'Campaign name' })).toBeNull();
    expect(cardNames()).toEqual([]);
  });

  it('shows a campaign of a newer Atlas with its fields disabled and says why', async () => {
    await openPage([{ id: 'a', name: 'Cairn', createdAt: 1, format: 2 }], 'Cairn');
    expect(screen.getByText('This campaign was saved by a newer version of Atlas. Update Atlas to change it.')).toBeTruthy();
    expect(nameField().disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).disabled).toBe(true);
    expect((await screen.findByRole('button', { name: 'Choose a world map' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete campaign' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('searching campaigns on the dashboard', () => {
  const rowNames = cardNames;
  const MORE = ['Dolmenwood', 'Shadowdark', 'Mörk Borg'].map((name, index): StoredCampaign => ({ id: `m${index}`, name, createdAt: 0 }));

  it('filters many campaigns by name and description, and says when none match', async () => {
    await renderDashboard([
      { id: 'a', name: 'Cairn', createdAt: 1, description: 'The olms rise.' },
      { id: 'b', name: 'The Witherwild', createdAt: 2 },
      ...MORE,
    ]);
    const field = screen.getByRole('combobox', { name: 'Search campaigns' });
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    fireEvent.change(field, { target: { value: 'WITHER' } });
    expect(rowNames()).toEqual(['The Witherwild']);
    fireEvent.change(field, { target: { value: 'olms' } });
    expect(rowNames()).toEqual(['Cairn']);
    fireEvent.change(field, { target: { value: 'dragons' } });
    expect(rowNames()).toEqual([]);
    expect(screen.getByText('No campaigns match your search.')).toBeTruthy();
    fireEvent.change(field, { target: { value: '' } });
    expect(rowNames()).toEqual(['The Witherwild', 'Cairn', 'Dolmenwood', 'Mörk Borg', 'Shadowdark']);
  });

  it('offers no search while a glance shows every campaign', async () => {
    await renderDashboard([{ id: 'a', name: 'Cairn', createdAt: 1 }, { id: 'b', name: 'The Witherwild', createdAt: 2 }]);
    expect(screen.queryByRole('combobox', { name: 'Search campaigns' })).toBeNull();
  });
});

describe('a played campaign', () => {
  it('is played only from its online table: its page has no Play, and the page and card mark it while its table is open', async () => {
    const { app } = await renderDashboard([{ id: 'a', name: 'Cairn', createdAt: 1 }, { id: 'b', name: 'Dolmenwood', createdAt: 2 }]);
    const play = CampaignPlay.forApp(app);
    fireEvent.click(screen.getByRole('button', { name: /Cairn/ }));
    await screen.findByRole('button', { name: 'Delete campaign' });
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.queryByText('Playing')).toBeNull();

    act(() => play.play('a'));
    expect(screen.getByText('Playing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByRole('button', { name: /Cairn/ }).textContent).toContain('Playing');
    expect(screen.getByRole('button', { name: /Dolmenwood/ }).textContent).not.toContain('Playing');

    act(() => play.stop());
    expect(screen.getByRole('button', { name: /Cairn/ }).textContent).not.toContain('Playing');
  });

  it('ends the play at once when the GM deletes the campaign being played', async () => {
    const { app, storage } = await renderDashboard([{ id: 'a', name: 'Cairn', createdAt: 1 }]);
    const play = CampaignPlay.forApp(app);
    act(() => play.play('a'));
    fireEvent.click(screen.getByRole('button', { name: /Cairn/ }));
    dialogs.confirmAction.mockResolvedValueOnce(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete campaign' }));
    await waitFor(() => expect(storage.current()).toHaveLength(0));
    expect(play.playing()).toBeNull();
  });
});

describe('the party on a campaign\'s last scene', () => {
  it('shows the player characters who stood there, ringed ones as a fan, each named', async () => {
    await renderDashboard((sceneId) => [{ id: 'a', name: 'Cairn', createdAt: 1, lastScene: sceneId, lastPlayed: 5 }], { party: true });
    const row = screen.getByRole('button', { name: /Cairn/ });
    await waitFor(() => expect(within(row).getAllByRole('img')).toHaveLength(3));
    const fan = row.querySelector('.campaign-party__fan')!;
    expect(within(fan as HTMLElement).getAllByRole('img')).toEqual([within(row).getByRole('img', { name: 'Aria' }), within(row).getByRole('img', { name: 'Finn' })]);
    expect(within(row).getByRole('img', { name: 'Brom' }).closest('.campaign-party__row')).not.toBeNull();
    expect(within(row).queryByRole('img', { name: 'Olm' })).toBeNull();
    expect((fan.querySelector('.atlas-token-ring') as HTMLElement).style.getPropertyValue('--atlas-token-ring-color')).toBe('#aa3300');
    expect(row.querySelector('.campaign-party__row .atlas-token-ring')).toBeNull();

    fireEvent.click(row);
    await waitFor(() => expect(document.querySelectorAll('.campaign-page .campaign-face')).toHaveLength(3));
  });

  it('shows nobody for a campaign never played, or whose last scene is gone', async () => {
    await renderDashboard([
      { id: 'a', name: 'Cairn', createdAt: 1 },
      { id: 'b', name: 'Dolmenwood', createdAt: 2, lastScene: 'scene-gone' },
    ], { party: true });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(document.querySelectorAll('.campaign-face')).toHaveLength(0);
  });
});

describe('a campaign\'s game system', () => {
  // The dialog leaves at once, so a test sees the page as it is after a save.
  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

  async function openPage(initial: StoredCampaign[]): Promise<Awaited<ReturnType<typeof renderDashboard>>> {
    vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(memoryPresets() as unknown as SystemPresetFiles);
    const result = await renderDashboard(initial);
    fireEvent.click(screen.getByRole('button', { name: /Cairn/ }));
    await waitFor(() => expect(nameField().value).toBe('Cairn'));
    return result;
  }
  const row = (): HTMLButtonElement => screen.getByRole('button', { name: 'Game system' });
  const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Cairn: Game System' });
  const closed = async (): Promise<void> => { await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); };

  it('is none until one is picked, and then the system every map of the campaign plays by', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }]);
    expect(row().textContent).toContain('No game system');
    fireEvent.click(row());
    expect(within(dialog()).getByRole('radio', { name: /No game system/ }).getAttribute('aria-checked')).toBe('true');
    // Without a system there is nothing else to set.
    expect(within(dialog()).queryByRole('button', { name: 'Dice' })).toBeNull();

    fireEvent.click(within(dialog()).getByRole('radio', { name: /D&D 5e/ }));
    expect(within(dialog()).getByRole('button', { name: 'Dice' })).toBeTruthy();
    expect(within(dialog()).queryByRole('button', { name: 'Default Widgets' })).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await closed();

    const system = storage.current()[0]!.system as Record<string, unknown>;
    expect(system).toMatchObject({ systemPresetId: 'builtin:dnd5e', diceSetId: 'builtin:d20' });
    expect(system).not.toHaveProperty('defaultWidgets');
    expect(row().textContent).toContain('D&D 5e');
    expect(row().textContent).not.toContain('Edited');
  });

  it('is edited with the tabs of a collection\'s settings, and marked as edited', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }]);
    fireEvent.click(row());
    fireEvent.click(within(dialog()).getByRole('radio', { name: /D&D 5e/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Dice' }));
    fireEvent.click(within(dialog()).getByRole('option', { name: /^Power roll/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await closed();

    expect(storage.current()[0]!.system).toMatchObject({ systemPresetId: 'builtin:dnd5e', diceSetId: 'builtin:power-roll' });
    expect(row().textContent).toContain('D&D 5e');
    expect(row().textContent).toContain('Edited');

    // What was not saved stays unsaved.
    fireEvent.click(row());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Dice' }));
    fireEvent.click(within(dialog()).getByRole('option', { name: /^d20 roll-under/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await closed();
    expect(storage.current()[0]!.system).toMatchObject({ diceSetId: 'builtin:power-roll' });
  });

  it('is removed by choosing no game system, which leaves every map to its collection', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1, system: { systemPresetId: 'builtin:cairn', gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [] } }]);
    expect(row().textContent).toContain('Cairn');
    fireEvent.click(row());
    fireEvent.click(within(dialog()).getByRole('radio', { name: /No game system/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await closed();
    expect(storage.current()[0]).not.toHaveProperty('system');
    expect(row().textContent).toContain('No game system');
  });

  it('cannot be changed in a campaign a newer Atlas saved', async () => {
    await openPage([{ id: 'a', name: 'Cairn', createdAt: 1, format: 2 }]);
    expect(row().disabled).toBe(true);
  });
});
