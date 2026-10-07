import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/app/dice3d/customLookArt', () => ({ lookArt: () => Promise.resolve({ faces: new Map(), bump: new Map() }) }));
vi.mock('../../../src/app/dice3d/dieArtwork', () => ({ loadDiceArtwork: () => Promise.resolve() }));

import { addCustomLook, type CustomDiceLook } from '../../../src/app/dice3d/customLooks';
import { renderLookPreviews } from '../../../src/app/dice3d/lookPreviews';
import { DiceLookStrip } from '../../../src/app/react/components/command-palette/DiceLookStrip';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const look = (id: string, preview: string | null): CustomDiceLook => ({ id, name: id, faces: () => Promise.resolve({}), body: null, ink: null, preview });
let removals: Array<() => void> = [];
afterEach(() => {
  cleanup();
  removals.forEach((remove) => remove());
  removals = [];
});

describe('dice look previews', () => {
  it("keeps a look's own preview, and never rejects where Atlas cannot draw dice (no WebGL here)", async () => {
    removals.push(addCustomLook(look('ext:own', 'data:image/png;base64,AA')), addCustomLook(look('ext:drawn', null)));
    const previews = await renderLookPreviews();
    expect(previews['ext:own']).toBe('data:image/png;base64,AA');
    expect(previews['ext:drawn']).toBeUndefined();
  });

  it("shows a rendered preview where a look gives none, its own where it does, and none for a look not loaded", () => {
    render(<DiceLookStrip value="" onChange={() => undefined} previews={{ '': 'data:atlas', 'ext:drawn': 'data:drawn', 'gone:x': 'data:stale' }} choices={[
      { value: '', label: 'Atlas dice', preview: null, loaded: true },
      { value: 'ext:drawn', label: 'Drawn', preview: null, loaded: true },
      { value: 'ext:own', label: 'Own', preview: 'data:own', loaded: true },
      { value: 'gone:x', label: 'gone:x (not loaded)', preview: null, loaded: false },
    ]} />);
    expect([...document.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['data:atlas', 'data:drawn', 'data:own']);
  });

  it("shows the chosen look's preview beside the dice look setting, and none while only Atlas's dice exist", async () => {
    const { Setting } = await import('obsidian');
    const { diceSettingsSection } = await import('../../../src/app/settings/diceSettingsSection');
    const settings = new SettingsService(createInMemoryApp().app);
    const row = diceSettingsSection(settings).rows.find((candidate) => candidate.name === 'Dice look')!;
    const setting = new Setting(document.body);
    const stop = row.render(setting) as () => void;
    const img = setting.controlEl.querySelector('img')!;
    expect(img.hidden).toBe(true);
    removals.push(addCustomLook(look('ext:own', 'data:own')));
    settings.setDiceLookId('ext:own');
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('data:own'));
    expect(img.hidden).toBe(false);
    expect(img.getAttribute('alt')).toBe('');
    stop();
  });
});
