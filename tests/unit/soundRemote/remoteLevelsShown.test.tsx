// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Setting } from 'obsidian';
import { MasterStrip } from '@/app/react/components/dm-screen/sound/DeskStrips';
import type { SettingsService } from '@/app/services/SettingsService';
import { soundSettingsSection } from '@/app/settings/soundSettingsSection';
import { RemoteCommands } from '@/app/soundRemote/remoteCommands';
import { directorRig, type DirectorRig } from '../../helpers/soundDirectorRig';

interface LevelSliders {
  music: HTMLInputElement;
  ambience: HTMLInputElement;
  master: HTMLInputElement;
  close(): void;
}

/** The level rows of Settings → Sound as Obsidian draws them, over the rig's stored settings. */
function levelSliders(rig: DirectorRig): LevelSliders {
  const { rows } = soundSettingsSection({ getSoundSettings: () => rig.settings } as Pick<SettingsService, 'getSoundSettings'> as SettingsService, rig.director);
  const cleanups: Array<() => void> = [];
  const slider = (name: string): HTMLInputElement => {
    const row = rows.find((one) => one.name === name);
    if (!row) throw new Error(`No ${name} row`);
    const setting = new Setting(document.body);
    const cleanup = row.render(setting);
    if (cleanup) cleanups.push(cleanup);
    const input = setting.controlEl.querySelector<HTMLInputElement>('input[type="range"]');
    if (!input) throw new Error(`No ${name} slider`);
    return input;
  };
  return { music: slider('Music'), ambience: slider('Ambience'), master: slider('Master'), close: () => cleanups.forEach((cleanup) => cleanup()) };
}

describe('levels a Stream Deck moves, as Atlas shows them', () => {
  let rig: DirectorRig;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    rig = directorRig([]);
  });

  afterEach(() => {
    rig.director.destroy();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('moves the music and ambience sliders at once, and writes the settings only once the dial rests', () => {
    const sliders = levelSliders(rig);
    const commands = new RemoteCommands(rig.director, () => null);
    expect(sliders.music.value).toBe('0');
    expect(sliders.ambience.value).toBe('-6');

    commands.run({ type: 'level', channel: 'music', deltaDb: 3 });
    commands.run({ type: 'level', channel: 'ambience', deltaDb: -3 });
    expect(sliders.music.value).toBe('3');
    expect(sliders.ambience.value).toBe('-9');
    // A slider that follows does not save each notch itself.
    expect(rig.settings).toMatchObject({ musicDb: 0, ambienceDb: -6 });

    vi.advanceTimersByTime(600);
    expect(rig.settings).toMatchObject({ musicDb: 3, ambienceDb: -9 });
    expect(sliders.music.value).toBe('3');
    sliders.close();
  });

  it('stops following once the settings close', () => {
    const sliders = levelSliders(rig);
    sliders.close();
    new RemoteCommands(rig.director, () => null).run({ type: 'level', channel: 'music', deltaDb: 3 });
    expect(sliders.music.value).toBe('0');
  });

  it('hands a slider moved by hand to the director, whose levels the Stream Deck is sent', () => {
    const sliders = levelSliders(rig);
    sliders.music.value = '-12';
    sliders.music.dispatchEvent(new Event('change'));
    expect(rig.director.snapshot().levels.musicDb).toBe(-12);
    expect(rig.settings.musicDb).toBe(-12);
    sliders.close();
  });

  it('keeps a step another setting is saved over before the dial rests', () => {
    const commands = new RemoteCommands(rig.director, () => null);
    commands.run({ type: 'level', channel: 'music', deltaDb: -6 });
    Object.assign(rig.settings, { fadeSeconds: 8 });
    rig.fireSettings();
    expect(rig.director.snapshot().levels.musicDb).toBe(-6);
    vi.advanceTimersByTime(600);
    expect(rig.settings.musicDb).toBe(-6);
  });

  it('still takes a level the stored settings changed, as another device writes it', () => {
    new RemoteCommands(rig.director, () => null).run({ type: 'level', channel: 'music', deltaDb: -6 });
    Object.assign(rig.settings, { ambienceDb: -20 });
    rig.fireSettings();
    expect(rig.director.snapshot().levels).toMatchObject({ musicDb: -6, ambienceDb: -20 });
  });

  it('moves the Sound page\'s Master fader with a master step', () => {
    render(<MasterStrip director={rig.director} />);
    const fader = screen.getByRole('slider');
    expect(fader.getAttribute('aria-valuenow')).toBe('0');
    act(() => { new RemoteCommands(rig.director, () => null).run({ type: 'level', channel: 'master', deltaDb: -4 }); });
    expect(fader.getAttribute('aria-valuenow')).toBe('-4');
  });
});
