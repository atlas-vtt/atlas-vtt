import { describe, expect, it } from 'vitest';
import { electronWindowOf, nativeFolderPicker, systemTrash } from '../../src/app/services/electronRemote';
import { nodeFilesOf } from '../../src/app/soundLibrary/nodeFiles';

/**
 * The windows Atlas meets where there is no Node: Obsidian's mobile apps have no `require` on the
 * window, and what stands in for one may answer nothing or refuse.
 */
const WINDOWS: Record<string, object> = {
  'no require': {},
  'a require that is no function': { require: 'electron' },
  'a require that answers nothing': { require: (): undefined => undefined },
  'a require that answers null': { require: (): null => null },
  'a require that refuses': { require: (name: string): never => { throw new Error(`Cannot find module '${name}'`); } },
  'a require whose modules are empty': { require: (): object => ({}) },
};

describe.each(Object.keys(WINDOWS))('a window with %s', (name) => {
  const win = WINDOWS[name] as Window;

  it('has no Electron window', () => {
    expect(electronWindowOf(win)).toBeNull();
  });

  it('has no folder picker', () => {
    expect(nativeFolderPicker(win)).toBeNull();
  });

  it('has no system trash', () => {
    expect(systemTrash(win)).toBeNull();
  });

  it('has no files outside the vault', () => {
    expect(nodeFilesOf(win)).toBeNull();
  });
});
