import { stringifyYaml, type TFile } from 'obsidian';
import { act } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { t } from '../../src/app/i18n';
import { DARK, openSoundTab, seedMoods, type SoundTab } from './sound/soundTabHarness';
import { all, clickText, settle, showing, type OpenedSurface, type ScreenSurface } from './textFitScreensSurfaces';

const NOTE = 'Bestiary/Bog Hag of the Drowned Chapel.md';
const BOG_HAG = {
  statblock: true, 'atlas-template': 'builtin:5e-2024-monster', name: 'Bog Hag of the Drowned Chapel', size: 'Medium', type: 'fey',
  alignment: 'neutral evil', ac: 17, hp: 82, speed: '30 ft., swim 40 ft.', cr: '5',
  actions: [{ name: 'Claws of the marsh', desc: 'Melee Attack Roll: +6, reach 5 ft. Hit: 13 (2d8 + 4) slashing damage.' }],
};

async function playing(tab: SoundTab): Promise<void> {
  tab.director.shelf.request([...tab.records.values()]);
  await expect.poll(() => [...tab.records.values()].every((record) => tab.director.shelf.stateOf(record).state === 'ready'), { timeout: 60_000, interval: 100 }).toBe(true);
  await userEvent.keyboard('1');
  await expect.poll(() => document.querySelector('.atlas-sound-mood[data-playing]')).not.toBeNull();
  await act(async () => { await settle(300); });
}

/** The real DM screen on its Sound page with a mood playing, the mood's editor, the mix's menu, then its Statblocks page. */
async function openDMScreen(window: { width: number; height: number }): Promise<OpenedSurface> {
  const viewport = document.body.createDiv();
  viewport.style.cssText = `position: absolute; top: 0; left: 0; width: ${window.width}px; height: ${window.height}px; contain: strict; overflow: hidden`;
  const tab = await openSoundTab(DARK, viewport);
  seedMoods(tab);
  await expect.poll(() => document.querySelectorAll('.atlas-sound-mood').length).toBe(11);
  await playing(tab);
  const escape = async (): Promise<void> => {
    await userEvent.keyboard('{Escape}');
    await settle(300);
  };
  return {
    parts: {
      '': async () => viewport,
      'mood editor': async () => {
        act(() => document.querySelector<HTMLElement>('[data-sound-mood]')?.focus());
        await userEvent.keyboard('{Shift>}{F10}{/Shift}');
        await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
        clickText('[role="menuitem"]', t('audio.mood.edit'));
        await expect.poll(() => document.querySelector('.atlas-sound-popover')).not.toBeNull();
        await settle(300);
        return all('.atlas-sound-popover');
      },
      'mix menu': async () => {
        await escape();
        document.querySelector<HTMLElement>('.atlas-sound-desk__head .atlas-sound-icon')?.click();
        await settle(300);
        return all('[role="menu"]');
      },
      'statblocks page': async () => {
        await escape();
        const { app, store } = tab;
        await app.vault.create(NOTE, `---\n${stringifyYaml(BOG_HAG)}---\n`);
        vi.mocked(app.metadataCache.getFileCache).mockImplementation((file: TFile) => (file.path === NOTE ? { frontmatter: BOG_HAG } : null));
        act(() => {
          store.setState((state: ReturnType<typeof store.getState>) => ({
            objects: { ...state.objects, tokens: { t1: { id: 't1', kind: 'character', x: 0, y: 0, imagePath: '', name: 'Bog hag', statblockPath: NOTE } } },
          }) as never);
          store.getState().setDMScreenPage('statblocks');
        });
        await settle(1200);
        return showing(viewport, '.atlas-dm-statblocks-grid .atlas-statblock');
      },
    },
    close: () => {
      tab.unmount();
      viewport.remove();
      document.getElementById('sound-tab-theme')?.remove();
    },
  };
}

export const SOUND_SURFACES: readonly ScreenSurface[] = [
  { name: 'DM screen', open: openDMScreen },
];
