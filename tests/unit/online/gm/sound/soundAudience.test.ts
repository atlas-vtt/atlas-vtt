import { describe, expect, it } from 'vitest';
import type { PlayerSoundState } from '@/app/online/protocol';
import { SoundAudience, type AudienceFacts } from '@/app/online/gm/sound/soundAudience';

const playing = (waiting: string[] = []): PlayerSoundState => ({ t: 'sound-state', state: 'playing', waiting });
const NAMES: Record<string, string> = { p1: 'Kara', p2: 'Finn', p3: 'Mira', p4: 'Oskar', p5: 'Ilse' };

function audience(players: string[], over: Partial<AudienceFacts> = {}): SoundAudience {
  return new SoundAudience({ connected: () => players, soundsPlaying: () => 2, uploading: () => 0, stopped: () => false, nameOf: (player) => NAMES[player] ?? null, ...over });
}

describe('who hears the table', () => {
  it('names who hears and why the others do not', () => {
    const line = audience(['p1', 'p2', 'p3', 'p4']);
    line.take('p1', playing());
    line.take('p2', playing(['a', 'b']));
    line.take('p3', { t: 'sound-state', state: 'needs-tap', waiting: [] });
    expect(line.line()).toBe('1 of 4 players hearing');
    expect(line.detail()).toBe('Hearing: Kara. Still loading the sounds: Finn. Must tap or click their page to hear: Mira. Sound not turned on: Oskar.');
  });

  it('says stopped, not hearing, while Stop all holds the table', () => {
    const line = audience(['p1'], { stopped: () => true });
    line.take('p1', playing());
    expect(line.line()).toBe('Stopped for 1 player');
    expect(line.detail()).toBe('Sound on: Kara.');
  });

  it('names a few and counts the rest', () => {
    const line = audience(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    for (const player of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) line.take(player, playing());
    expect(line.detail()).toBe('Hearing: Kara, Finn, Mira, and 3 more.');
  });

  it('says so when nobody is at the table', () => {
    expect(audience([]).detail()).toBe('No players at the table.');
  });
});
