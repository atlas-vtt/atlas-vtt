// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteCommands } from '@/app/soundRemote/remoteCommands';
import { fakeRemoteDirector, remoteMood, withMusic } from '../../helpers/soundRemoteRig';

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

  it('moves this device\'s levels within their range and writes them once the dial rests', () => {
    const director = fakeRemoteDirector(withMusic());
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'level', channel: 'music', deltaDb: -2 });
    commands.run({ type: 'level', channel: 'music', deltaDb: -2 });
    expect(director.snapshot().levels.musicDb).toBe(-7);
    commands.run({ type: 'level', channel: 'master', deltaDb: 50 });
    expect(director.snapshot().levels.masterDb).toBe(6);
    commands.run({ type: 'level', channel: 'ambience', reset: true });
    expect(director.snapshot().levels.ambienceDb).toBe(0);
    expect(director.setChannelLevels).not.toHaveBeenCalledWith(expect.anything(), true);
    vi.advanceTimersByTime(1000);
    expect(director.setChannelLevels).toHaveBeenLastCalledWith({}, true);
  });

  it('moves the music strip of the mix within a mood level\'s range', () => {
    const director = fakeRemoteDirector(withMusic());
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'level', channel: 'musicStrip', deltaDb: 3 });
    expect(director.desk.setMusicLevel).toHaveBeenLastCalledWith(-1);
    commands.run({ type: 'level', channel: 'musicStrip', db: 40 });
    expect(director.desk.setMusicLevel).toHaveBeenLastCalledWith(12);
  });

  it('writes levels still waiting when it is let go', () => {
    const director = fakeRemoteDirector();
    const commands = new RemoteCommands(director, () => null);
    commands.run({ type: 'level', channel: 'music', db: -10 });
    commands.dispose();
    expect(director.setChannelLevels).toHaveBeenLastCalledWith({}, true);
  });
});
