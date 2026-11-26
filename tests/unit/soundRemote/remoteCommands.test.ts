// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { faderDb } from '@/app/react/components/dm-screen/sound/faderScale';
import { RemoteCommands } from '@/app/soundRemote/remoteCommands';
import { fakeRemoteDirector, remoteMood, withLayers, withMusic } from '../../helpers/soundRemoteRig';

describe('remote commands as intents', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends the same intents the palette and the Sound page send', () => {
    const director = fakeRemoteDirector(withMusic());
    const tavern = remoteMood('tavern');
    const commands = new RemoteCommands(director, (id) => (id === 'tavern' ? tavern : null));
    expect(commands.run({ type: 'mood', id: 'tavern' })).toBeNull();
    expect(director.press).toHaveBeenCalledWith(tavern);
    commands.run({ type: 'nextMood' });
    commands.run({ type: 'stopAll' });
    commands.run({ type: 'pause' });
    commands.run({ type: 'nextTrack' });
    commands.run({ type: 'previousTrack' });
    expect(director.pressNext).toHaveBeenCalledOnce();
    expect(director.desk.toggleSilence).toHaveBeenCalledOnce();
    expect(director.desk.togglePause).toHaveBeenCalledOnce();
    expect(director.desk.skip).toHaveBeenCalledOnce();
    expect(director.desk.back).toHaveBeenCalledOnce();
  });

  it('toggles shuffle, mute and repeat from what plays, as the music card does', () => {
    const director = fakeRemoteDirector(withMusic());
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'shuffle' });
    commands.run({ type: 'muteMusic' });
    commands.run({ type: 'repeat' });
    expect(director.desk.setShuffle).toHaveBeenCalledWith(true);
    expect(director.desk.setMusicMuted).toHaveBeenCalledWith(true);
    // Unset repeats the list; the card goes all, one, off.
    expect(director.desk.setRepeat).toHaveBeenCalledWith('one');
  });

  it('says why it did nothing', () => {
    const director = fakeRemoteDirector();
    const commands = new RemoteCommands(director, () => null);
    expect(commands.run({ type: 'mood', id: 'gone' })).toBe('no-mood');
    expect(commands.run({ type: 'shuffle' })).toBe('no-music');
    expect(commands.run({ type: 'level', channel: 'musicStrip', deltaDb: 1 })).toBe('no-music');
    director.isOn = false;
    expect(commands.run({ type: 'nextMood' })).toBe('sound-off');
    expect(director.pressNext).not.toHaveBeenCalled();
  });

  it('moves Master, this device\'s level, within its range and writes it once the dial rests', () => {
    const director = fakeRemoteDirector(withMusic());
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'level', channel: 'master', deltaDb: -2 });
    commands.run({ type: 'level', channel: 'master', deltaDb: -2 });
    expect(director.snapshot().levels.masterDb).toBe(-4);
    commands.run({ type: 'level', channel: 'master', deltaDb: 50 });
    expect(director.snapshot().levels.masterDb).toBe(6);
    expect(director.setChannelLevels).not.toHaveBeenCalledWith(expect.anything(), true);
    vi.advanceTimersByTime(1000);
    expect(director.setChannelLevels).toHaveBeenLastCalledWith({}, true);
  });

  it('moves the Sound page\'s Music fader, also for an older controller\'s Music in mix, within what the fader shows', () => {
    const director = fakeRemoteDirector(withMusic());
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'level', channel: 'music', deltaDb: 3 });
    expect(director.desk.setMusicLevel).toHaveBeenLastCalledWith(-1);
    commands.run({ type: 'level', channel: 'musicStrip', deltaDb: -2 });
    expect(director.desk.setMusicLevel).toHaveBeenLastCalledWith(-6);
    commands.run({ type: 'level', channel: 'music', db: 40 });
    expect(director.desk.setMusicLevel).toHaveBeenLastCalledWith(faderDb(1));
    commands.run({ type: 'level', channel: 'music', db: -100 });
    expect(director.desk.setMusicLevel).toHaveBeenLastCalledWith(faderDb(0));
    // This device's own music level stays where Settings put it.
    expect(director.setChannelLevels).not.toHaveBeenCalled();
  });

  it('moves every ambience layer by one step, in one change, each within what a fader shows', () => {
    const director = fakeRemoteDirector(withLayers({ rain: -10, wind: 2, fire: -58 }));
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'level', channel: 'ambience', deltaDb: -3 });
    expect(director.desk.setLayerLevels).toHaveBeenCalledOnce();
    expect(director.desk.setLayerLevels).toHaveBeenLastCalledWith(new Map([['rain', -13], ['wind', -1], ['fire', faderDb(0)]]));
  });

  it('stops ambience at the top with the loudest layer, so the others keep their distance below it', () => {
    const director = fakeRemoteDirector(withLayers({ rain: -10, wind: 5 }));
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'level', channel: 'ambience', deltaDb: 5 });
    expect(director.desk.setLayerLevels).toHaveBeenLastCalledWith(new Map([['rain', -9], ['wind', faderDb(1)]]));
  });

  it('puts the loudest ambience layer back to 0 dB, and the others with it', () => {
    const director = fakeRemoteDirector(withLayers({ rain: -10, wind: 5 }));
    new RemoteCommands(director, () => null).run({ type: 'level', channel: 'ambience', reset: true });
    expect(director.desk.setLayerLevels).toHaveBeenLastCalledWith(new Map([['rain', -15], ['wind', 0]]));
  });

  it('does nothing to ambience while the mix has no layers', () => {
    const director = fakeRemoteDirector(withMusic());
    const commands = new RemoteCommands(director, () => null);
    expect(commands.run({ type: 'level', channel: 'ambience', deltaDb: 2 })).toBe('no-ambience');
    expect(director.desk.setLayerLevels).not.toHaveBeenCalled();
  });

  it('writes levels still waiting when it is let go', () => {
    const director = fakeRemoteDirector();
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'level', channel: 'master', db: -10 });
    commands.dispose();
    expect(director.setChannelLevels).toHaveBeenLastCalledWith({}, true);
  });
});
