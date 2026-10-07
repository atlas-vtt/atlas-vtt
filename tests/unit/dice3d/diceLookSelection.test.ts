import { afterEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ refresh: vi.fn(), art: vi.fn<(look: unknown) => Promise<unknown>>() }));
vi.mock('../../../src/app/dice3d/dieMesh', () => ({ refreshDieArtwork: runtime.refresh }));
vi.mock('../../../src/app/dice3d/dieArtwork', () => ({ loadDiceArtwork: () => Promise.resolve() }));
vi.mock('../../../src/app/dice3d/customLookArt', () => ({ lookArt: runtime.art, onLateLookArt: () => () => undefined }));

import type { Plugin } from 'obsidian';
import { addCustomLook, type CustomDiceLook } from '../../../src/app/dice3d/customLooks';
import { applyDiceLook } from '../../../src/app/dice3d/diceLookRuntime';
import { diceLookChoices } from '../../../src/app/dice3d/diceLookChoices';
import { activeLook } from '../../../src/app/dice3d/dieSkin';
import { registerDiceLookSync } from '../../../src/app/plugin/diceLookSync';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const look = (id: string, name = id): CustomDiceLook => ({ id, name, faces: () => Promise.resolve({}), body: '#aa2211', ink: null, preview: null });
const EMPTY_ART = { faces: new Map(), bump: new Map() };

/** Runs every pending promise callback: the look applies after its artwork resolved. */
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function started(): { settings: SettingsService; cssChange: () => void; unload: () => void } {
  const { app } = createInMemoryApp();
  const settings = new SettingsService(app);
  const cleanups: Array<() => void> = [];
  let css: () => void = () => undefined;
  const workspace = { on: (_name: string, callback: () => void) => { css = callback; return {}; } };
  const plugin = { app: { ...app, workspace }, register: (cleanup: () => void) => cleanups.push(cleanup), registerEvent: () => undefined } as unknown as Plugin;
  registerDiceLookSync(plugin, settings);
  return { settings, cssChange: () => css(), unload: () => cleanups.forEach((cleanup) => cleanup()) };
}

let removals: Array<() => void> = [];
const register = (registered: CustomDiceLook): () => void => {
  const remove = addCustomLook(registered);
  removals.push(remove);
  return remove;
};
afterEach(() => {
  removals.forEach((remove) => remove());
  removals = [];
  runtime.refresh.mockReset();
  runtime.art.mockReset();
});

describe('choosing a dice look', () => {
  it('applies a look once its art is ready, repainting the faces once, and a later call wins', async () => {
    runtime.art.mockResolvedValue(EMPTY_ART);
    const fire = look('ext:fire');
    const first = applyDiceLook({ colour: 'light', font: 'medieval' }, document, fire);
    const second = applyDiceLook({ colour: 'dark', font: 'medieval' }, document, null);
    await Promise.all([first, second]);
    expect(runtime.refresh).toHaveBeenCalledTimes(1);
    expect(activeLook()).toMatchObject({ lookId: null, colour: 'dark' });
    await applyDiceLook({ colour: 'light', font: 'medieval' }, document, fire);
    expect(activeLook()).toMatchObject({ lookId: 'ext:fire', body: '#aa2211' });
  });

  it('stores the choice by full id, shows it while registered, and keeps it while its extension is not loaded', async () => {
    runtime.art.mockResolvedValue(EMPTY_ART);
    const { settings, unload } = started();
    await settle();
    runtime.refresh.mockClear();
    settings.setDiceLookId('ext:fire');
    await settle();
    // Not registered yet: Atlas's own look, the choice kept and listed as not loaded.
    expect(activeLook().lookId).toBeNull();
    expect(settings.getDiceLookId()).toBe('ext:fire');
    expect(diceLookChoices('ext:fire').map(({ value, loaded }) => [value, loaded])).toEqual([['', true], ['ext:fire', false]]);
    runtime.refresh.mockClear();
    const remove = register(look('ext:fire', 'Fire'));
    await settle();
    expect(activeLook().lookId).toBe('ext:fire');
    expect(runtime.refresh).toHaveBeenCalledTimes(1);
    expect(diceLookChoices('ext:fire').map(({ value, label }) => [value, label])).toEqual([['', 'Atlas dice'], ['ext:fire', 'Fire']]);
    // Unregistered while in effect: the default look, painted once, and the choice stays.
    remove();
    await settle();
    expect(activeLook().lookId).toBeNull();
    expect(runtime.refresh).toHaveBeenCalledTimes(2);
    expect(settings.getDiceLookId()).toBe('ext:fire');
    // Registered again: it returns.
    register(look('ext:fire', 'Fire'));
    await settle();
    expect(activeLook().lookId).toBe('ext:fire');
    unload();
  });

  it('another extension registering a look it did not choose repaints nothing; a CSS change repaints without asking for art again', async () => {
    runtime.art.mockResolvedValue(EMPTY_ART);
    const { settings, cssChange, unload } = started();
    const fire = look('ext:fire');
    register(fire);
    settings.setDiceLookId('ext:fire');
    await settle();
    runtime.refresh.mockClear();
    register(look('other:ice'));
    await settle();
    expect(runtime.refresh).not.toHaveBeenCalled();
    cssChange();
    await settle();
    expect(runtime.refresh).toHaveBeenCalledTimes(1);
    // The art is the art module's to keep per registration: the sync hands the same registration each time.
    expect(new Set(runtime.art.mock.calls.map(([given]) => given))).toEqual(new Set([fire]));
    settings.setDiceLookId('');
    await settle();
    expect(activeLook().lookId).toBeNull();
    unload();
  });
});

describe('the dice look setting', () => {
  it("lists Atlas's dice and every registered look, follows registrations and stores the full id chosen", async () => {
    const { Setting } = await import('obsidian');
    const { diceSettingsSection } = await import('../../../src/app/settings/diceSettingsSection');
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    const row = diceSettingsSection(settings).rows.find((candidate) => candidate.name === 'Dice look')!;
    const setting = new Setting(document.body);
    const stop = row.render(setting) as () => void;
    const select = setting.controlEl.querySelector('select')!;
    const options = (): string[] => [...select.options].map((option) => `${option.value}=${option.textContent}`);
    expect(options()).toEqual(['=Atlas dice']);
    register(look('ext:fire', 'Fire'));
    expect(options()).toEqual(['=Atlas dice', 'ext:fire=Fire']);
    select.value = 'ext:fire';
    select.dispatchEvent(new Event('change'));
    expect(settings.getDiceLookId()).toBe('ext:fire');
    removals.splice(0).forEach((remove) => remove());
    expect(options()).toEqual(['=Atlas dice', 'ext:fire=ext:fire (not loaded)']);
    expect(select.value).toBe('ext:fire');
    expect(setting.descEl.textContent).toContain('not loaded');
    stop();
    register(look('ext:ice', 'Ice'));
    expect(options()).toHaveLength(2);
  });
});
