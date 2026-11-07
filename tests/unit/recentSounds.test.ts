import { describe, expect, it } from 'vitest';
import { recentSounds, rememberSound } from '../../src/app/audio/recentSounds';
import { createInMemoryApp } from '../mocks/inMemoryVault';

describe('recent sounds', () => {
  it('remembers the five sounds picked last, the latest first, each once', () => {
    const { app } = createInMemoryApp();
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'b']) rememberSound(app, `Sounds/${name}.mp3`);
    expect(recentSounds(app)).toEqual(['Sounds/b.mp3', 'Sounds/f.mp3', 'Sounds/e.mp3', 'Sounds/d.mp3', 'Sounds/c.mp3']);
  });

  it('keeps them on this device, out of the vault\'s files', () => {
    const { app, files, localStorage } = createInMemoryApp();
    rememberSound(app, 'Sounds/roar.mp3');
    expect(localStorage.size).toBe(1);
    expect(files.size).toBe(0);
  });

  it('reads nothing from storage that is not a list of paths', () => {
    const { app, localStorage } = createInMemoryApp();
    expect(recentSounds(app)).toEqual([]);
    localStorage.set('atlas-vtt:recent-token-sounds', 'Sounds/roar.mp3');
    expect(recentSounds(app)).toEqual([]);
    localStorage.set('atlas-vtt:recent-token-sounds', ['Sounds/roar.mp3', 7, '', null]);
    expect(recentSounds(app)).toEqual(['Sounds/roar.mp3']);
  });
});
