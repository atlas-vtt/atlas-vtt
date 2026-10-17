import { describe, expect, it } from 'vitest';
import { orderSoundFiles } from '../../src/app/audio/soundFileOrder';

const files = (...paths: string[]): { path: string }[] => paths.map((path) => ({ path }));
const paths = (ordered: readonly { path: string }[]): string[] => ordered.map(({ path }) => path);

describe('orderSoundFiles', () => {
  it('groups sounds by folder, then lists each folder by name, numbers in counting order and case aside', () => {
    const vault = files('Sounds/Spells/fireball.mp3', 'Sounds/Monsters/roar 10.mp3', 'theme.mp3', 'Sounds/Monsters/roar 2.mp3', 'Sounds/Monsters/Hiss.ogg', 'Sounds/battle.wav');
    expect(paths(orderSoundFiles(vault, []))).toEqual([
      'theme.mp3',
      'Sounds/battle.wav',
      'Sounds/Monsters/Hiss.ogg',
      'Sounds/Monsters/roar 2.mp3',
      'Sounds/Monsters/roar 10.mp3',
      'Sounds/Spells/fireball.mp3',
    ]);
  });

  it('puts the sounds picked recently first, the latest first, and lists each sound once', () => {
    const vault = files('Sounds/Spells/fireball.mp3', 'Sounds/Monsters/roar.mp3', 'theme.mp3');
    const recent = ['Sounds/Spells/fireball.mp3', 'Sounds/gone.mp3', 'theme.mp3'];
    expect(paths(orderSoundFiles(vault, recent))).toEqual(['Sounds/Spells/fireball.mp3', 'theme.mp3', 'Sounds/Monsters/roar.mp3']);
  });
});
