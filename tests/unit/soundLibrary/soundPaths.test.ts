import { describe, expect, it } from 'vitest';
import { externalAudioPath, freeName, movedRelative, readExternalAudioPath, relativeBelow, safeName, safeRelative } from '../../../src/app/soundLibrary/soundPaths';

describe('a path below a root', () => {
  it.each(['..', '../x', 'a/../../x', 'a/..', '/etc/passwd', 'C:/x', 'c:x', 'a\\..\\x', 'a//b', './a', 'a/./b', 'a/', 'a\0b'])('refuses %s', (path) => {
    expect(safeRelative(path)).toBeNull();
  });

  it.each(['', 'a', 'a/b.mp3', '..a/b', 'a../b', 'Sea shanties (live)/01.flac'])('takes %s', (path) => {
    expect(safeRelative(path)).toBe(path);
  });
});

describe('a name', () => {
  it('is trimmed, and refused where it could not stand in a folder', () => {
    expect(safeName(' Battle ')).toBe('Battle');
    for (const name of ['', '  ', '.hidden', 'a/b', 'a\\b', 'a:b', '..']) expect(safeName(name)).toBeNull();
  });

  it('takes a number where it is taken', async () => {
    const taken = new Set(['a.mp3', 'a 2.mp3']);
    await expect(freeName('a.mp3', (name) => taken.has(name))).resolves.toBe('a 3.mp3');
    await expect(freeName('b.mp3', (name) => taken.has(name))).resolves.toBe('b.mp3');
  });
});

describe('what a record says of a file outside the vault', () => {
  it('holds the root and the path, and reads back', () => {
    expect(readExternalAudioPath(externalAudioPath('ambience', 'Weather/Rain.ogg'))).toEqual({ root: 'ambience', path: 'Weather/Rain.ogg' });
  });

  it.each(['Music/a.mp3', 'atlas-sound:', 'atlas-sound:music', 'atlas-sound:music/', 'atlas-sound:other/a.mp3', 'atlas-sound:music/../a.mp3', 'atlas-sound:music//a'])('reads none from %s', (path) => {
    expect(readExternalAudioPath(path)).toBeNull();
  });
});

describe('a folder below another', () => {
  it('is told by whole names', () => {
    expect(relativeBelow('/Users/me/vault', '/Users/me/vault/Music/Battle')).toBe('Music/Battle');
    expect(relativeBelow('/Users/me/vault', '/Users/me/vault')).toBe('');
    expect(relativeBelow('/Users/me/vault', '/Users/me/vault2/Music')).toBeNull();
    expect(relativeBelow('/Users/me/vault/', '/Users/me/vault/a')).toBe('a');
  });

  it('on Windows, without case', () => {
    expect(relativeBelow('C:\\Users\\Me\\Vault', 'c:\\users\\me\\vault\\Music')).toBe('Music');
  });
});

it('moves a path and what lies below it, and nothing else', () => {
  expect(movedRelative('a/b', 'a/b', 'c')).toBe('c');
  expect(movedRelative('a/b/d.mp3', 'a/b', 'c')).toBe('c/d.mp3');
  expect(movedRelative('a/bc.mp3', 'a/b', 'c')).toBeNull();
});
