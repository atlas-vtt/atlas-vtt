// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Setting } from 'obsidian';
import { LayerStrip, MasterStrip } from '@/app/react/components/dm-screen/sound/DeskStrips';
import type { SettingsService } from '@/app/services/SettingsService';
import { soundSettingsSection } from '@/app/settings/soundSettingsSection';
import { shownMusic } from '@/app/soundDirector/musicPause';
import { RemoteCommands } from '@/app/soundRemote/remoteCommands';
import { ambienceLevel } from '@/app/soundRemote/remoteLevels';
import { remoteState } from '@/app/soundRemote/remoteState';
import { directorRig, mood, record, settle, type DirectorRig } from '../../helpers/soundDirectorRig';
import { fakeTable } from '../../helpers/soundRemoteRig';

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

  it('moves the Master slider at once, and writes the setting only once the dial rests', () => {
    const sliders = levelSliders(rig);
    const commands = new RemoteCommands(rig.director, () => null);
    expect(sliders.master.value).toBe('0');
    commands.run({ type: 'level', channel: 'master', deltaDb: -3 });
    commands.run({ type: 'level', channel: 'master', deltaDb: -3 });
    expect(sliders.master.value).toBe('-6');
    // A slider that follows does not save each notch itself.
    expect(rig.settings.masterDb).toBe(0);
    vi.advanceTimersByTime(600);
    expect(rig.settings.masterDb).toBe(-6);
    sliders.close();
  });

  it('follows the Sound page\'s Master fader too', () => {
    const sliders = levelSliders(rig);
    rig.director.setChannelLevels({ masterDb: -9 }, false);
    expect(sliders.master.value).toBe('-9');
    sliders.close();
  });

  it('stops following once the settings close', () => {
    const sliders = levelSliders(rig);
    sliders.close();
    new RemoteCommands(rig.director, () => null).run({ type: 'level', channel: 'master', deltaDb: -3 });
    expect(sliders.master.value).toBe('0');
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
    commands.run({ type: 'level', channel: 'master', deltaDb: -6 });
    Object.assign(rig.settings, { fadeSeconds: 8 });
    rig.fireSettings();
    expect(rig.director.snapshot().levels.masterDb).toBe(-6);
    vi.advanceTimersByTime(600);
    expect(rig.settings.masterDb).toBe(-6);
  });

  it('still takes a level the stored settings changed, as another device writes it', () => {
    new RemoteCommands(rig.director, () => null).run({ type: 'level', channel: 'master', deltaDb: -6 });
    Object.assign(rig.settings, { ambienceDb: -20 });
    rig.fireSettings();
    expect(rig.director.snapshot().levels).toMatchObject({ masterDb: -6, ambienceDb: -20 });
  });

  it('moves the Sound page\'s Master fader with a master step', () => {
    render(<MasterStrip director={rig.director} />);
    const fader = screen.getByRole('slider');
    expect(fader.getAttribute('aria-valuenow')).toBe('0');
    act(() => { new RemoteCommands(rig.director, () => null).run({ type: 'level', channel: 'master', deltaDb: -4 }); });
    expect(fader.getAttribute('aria-valuenow')).toBe('-4');
  });
});

describe('the Music and Ambience keys, as the Sound page shows them', () => {
  const SONG = record('song', 'music');
  const RAIN = record('rain');
  const WIND = record('wind');
  let rig: DirectorRig;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1_000_000);
    rig = directorRig([SONG, RAIN, WIND]);
    await settle();
    for (const sound of rig.records) rig.director.shelf.stateOf(sound);
    await settle();
    rig.director.press(mood('tavern', ['rain', 'wind'], { tracks: ['song'], shuffle: false, levelDb: -2 }));
    rig.director.desk.setLayerLevel('hash-audio/wind.ogg', -12);
  });

  afterEach(() => {
    rig.director.destroy();
    vi.useRealTimers();
  });

  const levelOf = (name: string): string | null => screen.getByRole('slider', { name: `Level of ${name}` }).getAttribute('aria-valuenow');

  // The music card needs the whole UI around it; its fader shows `shownMusic(mix).gainDb`.
  const musicFader = (): number | undefined => shownMusic(rig.director.snapshot().mix)?.gainDb;

  it('moves the Music fader the page shows, and not this device\'s own music level', () => {
    expect(musicFader()).toBe(-2);
    new RemoteCommands(rig.director, () => null).run({ type: 'level', channel: 'music', deltaDb: 3 });
    expect(musicFader()).toBe(1);
    expect(rig.director.snapshot().levels.musicDb).toBe(0);
  });

  it('moves every layer\'s fader by the same step, and shows the loudest on the key', () => {
    render(<>{['hash-audio/rain.ogg', 'hash-audio/wind.ogg'].map((key) => <LayerStrip key={key} director={rig.director} soundKey={key} />)}</>);
    expect([levelOf('RAIN'), levelOf('WIND')]).toEqual(['-3', '-12']);
    act(() => { new RemoteCommands(rig.director, () => null).run({ type: 'level', channel: 'ambience', deltaDb: -4 }); });
    expect([levelOf('RAIN'), levelOf('WIND')]).toEqual(['-7', '-16']);
    expect(rig.director.snapshot().levels.ambienceDb).toBe(-6);
    expect(ambienceLevel(rig.director.snapshot().mix)).toBe(-7);
  });

  it('sends the level keys what the page shows: Master, the Music fader and the loudest layer, none without layers', () => {
    const levels = (): unknown => remoteState(rig.director, () => null, fakeTable().table).levels;
    expect(levels()).toEqual({ masterDb: 0, musicDb: -2, ambienceDb: -3 });
    rig.director.desk.removeLayer('rain', 'hash-audio/rain.ogg');
    rig.director.desk.removeLayer('wind', 'hash-audio/wind.ogg');
    expect(levels()).toEqual({ masterDb: 0, musicDb: -2, ambienceDb: null });
  });
});
