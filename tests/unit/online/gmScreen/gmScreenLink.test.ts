import { describe, expect, it } from 'vitest';
import { GM_SCREEN_PATH, gmScreenFragment, gmScreenUrl, readGmScreenLink } from '../../../../src/app/online/protocol/index.ts';

const link = { code: 'abcdefghijklmnopqrstuvwxyz', key: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8' };

describe('the GM screen\'s link', () => {
  it('writes the room and the key into the fragment of the page\'s address, and reads them back', () => {
    const url = gmScreenUrl('https://play.example', link);
    expect(url).toBe(`https://play.example${GM_SCREEN_PATH}#${link.code}.${link.key}`);
    expect(readGmScreenLink(url)).toEqual(link);
  });

  it('reads a fragment with or without its #, and a pasted link with space around it', () => {
    for (const text of [`#${gmScreenFragment(link)}`, gmScreenFragment(link), `  https://play.example/gm-screen/#${gmScreenFragment(link)}\n`]) expect(readGmScreenLink(text), text).toEqual(link);
  });

  it('reads nothing from text that names no room and key', () => {
    const { code, key } = link;
    for (const text of [
      '', '#', code, `${code}.`, `.${key}`, `${code}${key}`, `${code.toUpperCase()}.${key}`, `${code.slice(1)}.${key}`, `${code}1.${key}`, `${code}.${key.slice(1)}`, `${code}.${key}A`,
      `${code}.${key.slice(0, -1)}9`, `${code}.${key.replace('A', '+')}`, `${code}.${key.replace('A', '/')}`, `${code}.${key}=`, `${code}.${key}.extra`, `${code}.${key} ${code}`,
      `#${code}.${key}`.padStart(3000, ' '), 7, null, undefined, { code, key },
    ]) expect(readGmScreenLink(text), String(text)).toBeNull();
  });
});
