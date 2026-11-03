// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSoundDirector } from '../../../src/app/plugin/soundDirector';
import { SoundPane } from '../../../src/app/react/components/dm-screen/sound/SoundPane';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { SOUND_VIEW_TYPE, SoundView } from '../../../src/app/sound-view';
import { MoodStore } from '../../../src/app/soundLibrary/MoodStore';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

let rig: LibraryRig;
const views: SoundView[] = [];
const hosts: HTMLElement[] = [];

/** A workspace leaf of the document, with the real view opened in it as Obsidian would. */
async function openView(): Promise<{ view: SoundView; leafEl: HTMLElement }> {
  const leafEl = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  hosts.push(leafEl);
  const view = new SoundView({ app: rig.app } as never);
  leafEl.append(view.containerEl);
  view.containerEl.append(view.contentEl);
  await act(async () => { await view.onOpen(); });
  views.push(view);
  return { view, leafEl };
}

const setSwitch = (on: boolean): void => {
  act(() => SettingsService.forApp(rig.app)?.setExperimental('sound', on));
};

beforeEach(async () => {
  // jsdom lays nothing out, and a tab of no width is one another tab covers.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  rig.locations.music.addFile('Battle/a.mp3');
  rig.locations.music.addFile('Calm/b.mp3');
  // The real switch: the page and the director both follow what it tells them.
  vi.mocked(SettingsService.forApp(rig.app)!.isExperimentalOn).mockRestore();
  setSwitch(true);
});

afterEach(async () => {
  for (const view of views.splice(0)) await act(async () => { await view.onClose(); });
  rig.unmount();
  cleanup();
  for (const host of hosts.splice(0)) host.remove();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  vi.restoreAllMocks();
});

describe('the palette command', () => {
  function command(): { check: (checking: boolean) => boolean; leaves: { setViewState: ReturnType<typeof vi.fn> }[]; getLeaf: ReturnType<typeof vi.fn>; revealLeaf: ReturnType<typeof vi.fn> } {
    const commands = new Map<string, (checking: boolean) => boolean>();
    const leaves: { setViewState: ReturnType<typeof vi.fn> }[] = [];
    const getLeaf = vi.fn(() => {
      const leaf = { setViewState: vi.fn(async () => undefined) };
      leaves.push(leaf);
      return leaf;
    });
    const revealLeaf = vi.fn(async () => undefined);
    Object.assign(rig.app.workspace, { getLeaf, revealLeaf, getLeavesOfType: (type: string) => (type === SOUND_VIEW_TYPE ? leaves : []) });
    registerSoundDirector({
      app: rig.app,
      addCommand: ({ id, checkCallback }: { id: string; checkCallback: (checking: boolean) => boolean }) => commands.set(id, checkCallback),
      removeCommand: vi.fn(),
      addStatusBarItem: () => document.createElement('div'),
      register: vi.fn(),
      registerInterval: vi.fn(),
    } as never);
    return { check: commands.get('sound-open-page')!, leaves, getLeaf, revealLeaf };
  }

  it('is not offered while the switch is off', () => {
    setSwitch(false);
    const { check, getLeaf } = command();
    expect(check(true)).toBe(false);
    expect(check(false)).toBe(false);
    expect(getLeaf).not.toHaveBeenCalled();
  });

  it('opens one tab, and a second run reveals that one', async () => {
    const { check, leaves, getLeaf, revealLeaf } = command();
    expect(check(true)).toBe(true);
    expect(getLeaf).not.toHaveBeenCalled();

    check(false);
    await waitFor(() => expect(revealLeaf).toHaveBeenCalledTimes(1));
    expect(getLeaf).toHaveBeenCalledWith('tab');
    expect(leaves[0]?.setViewState).toHaveBeenCalledWith({ type: SOUND_VIEW_TYPE, active: true });

    check(false);
    await waitFor(() => expect(revealLeaf).toHaveBeenCalledTimes(2));
    expect(getLeaf).toHaveBeenCalledTimes(1);
    expect(revealLeaf).toHaveBeenLastCalledWith(leaves[0]);
  });
});

describe('the tab', () => {
  it('stands with no map and no store, with no page control', async () => {
    const { leafEl } = await openView();
    expect(leafEl.querySelector('.atlas-sound-pane .atlas-sound-lib')).not.toBeNull();
    expect(leafEl.querySelector('.atlas-sound-moods')).not.toBeNull();
    expect(leafEl.querySelector('.atlas-sound-desk')).not.toBeNull();
    expect(leafEl.querySelector('.atlas-dm-screen-pages')).toBeNull();
  });

  it('shows nothing of sound while the switch is off, restored or switched, and follows it back on', async () => {
    setSwitch(false);
    const { view, leafEl } = await openView();
    expect(view.contentEl.querySelector('[class*="atlas-sound"]')).toBeNull();

    setSwitch(true);
    expect(leafEl.querySelector('.atlas-sound-pane')).not.toBeNull();

    setSwitch(false);
    expect(view.contentEl.querySelector('.atlas-sound-pane')).toBeNull();
  });

  it('stops nothing when it closes', async () => {
    const { view } = await openView();
    const stop = vi.spyOn(rig.director, 'stop');
    await act(async () => { await view.onClose(); });
    expect(stop).not.toHaveBeenCalled();
  });

  it('leaves the digits alone while another tab covers it', async () => {
    MoodStore.forApp(rig.app).createMood({ name: 'Tavern', fadeSeconds: 2, music: 'none', layers: [] });
    const press = vi.spyOn(rig.director, 'press').mockImplementation(() => undefined);
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 0 });
    await openView();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true, cancelable: true }));
    expect(press).not.toHaveBeenCalled();
  });

  it('presses moods with the digits only while its leaf holds the focus', async () => {
    const mood = MoodStore.forApp(rig.app).createMood({ name: 'Tavern', fadeSeconds: 2, music: 'none', layers: [] });
    const press = vi.spyOn(rig.director, 'press').mockImplementation(() => undefined);
    const { leafEl } = await openView();
    const digit = (): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true, cancelable: true })); };

    digit();
    expect(press).toHaveBeenCalledTimes(1);
    expect(press).toHaveBeenCalledWith(mood);

    leafEl.classList.remove('mod-active');
    digit();
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('shows the tags a DM screen beside it selects, and the other way round', async () => {
    const { leafEl } = await openView();
    const mapLeaf = document.body.createDiv({ cls: 'workspace-leaf' });
    hosts.push(mapLeaf);
    await act(async () => rig.mount(mapLeaf, <SoundPane active={false} />));
    const pressed = (host: HTMLElement): string => [...host.querySelectorAll('.atlas-sound-lib__tag[aria-pressed="true"]')].map((tag) => tag.textContent).join(' ');

    act(() => rig.library.place.show('music', ['Battle']));
    await waitFor(() => expect(pressed(leafEl)).toContain('Battle'));
    expect(pressed(mapLeaf)).toContain('Battle');

    act(() => rig.library.place.show('music', ['Calm']));
    await waitFor(() => expect(pressed(mapLeaf)).toContain('Calm'));
    expect(pressed(leafEl)).toContain('Calm');
  });
});
