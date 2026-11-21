import { afterEach, describe, expect, it, vi } from 'vitest';
import { isResourceUrl, normalizeImagePath, resourceUrlToFilePath, resourceUrlToVaultPath, setResourcePathPrefix } from '../../../src/app/utils/pathUtils';

afterEach(() => {
  setResourcePathPrefix('');
  vi.restoreAllMocks();
});

describe('resource URLs', () => {
  it.each([
    ['the desktop app', 'app://f8a1c2/Users/gm/Vault/atlas-vtt/tokens/Goblin%20King.webp?1700000000000', 'Users/gm/Vault/atlas-vtt/tokens/Goblin King.webp'],
    ['the desktop app on Windows', 'app://f8a1c2/C:/Users/gm/Vault/atlas-vtt/maps/Keep.png?17', 'C:/Users/gm/Vault/atlas-vtt/maps/Keep.png'],
    ['the older desktop form', 'app://local/Users/gm/Vault/atlas-vtt/a.png', 'Users/gm/Vault/atlas-vtt/a.png'],
    ['mobile, as Obsidian documents it', 'file:///var/mobile/Documents/Vault/atlas-vtt/tokens/Orc.png?5', 'var/mobile/Documents/Vault/atlas-vtt/tokens/Orc.png'],
    ['Capacitor on iOS', 'capacitor://localhost/_capacitor_file_/var/mobile/Documents/Vault/atlas-vtt/tokens/Orc.png?5', 'var/mobile/Documents/Vault/atlas-vtt/tokens/Orc.png'],
    ['Capacitor on Android', 'http://localhost/_capacitor_file_/storage/emulated/0/Vault/atlas-vtt/tokens/Orc%231.png?5', 'storage/emulated/0/Vault/atlas-vtt/tokens/Orc#1.png'],
    ['Capacitor over https', 'https://localhost/_capacitor_file_/storage/emulated/0/Vault/a.png', 'storage/emulated/0/Vault/a.png'],
  ])('of %s name their file', (_name, url, filePath) => {
    expect(isResourceUrl(url)).toBe(true);
    expect(resourceUrlToFilePath(url)).toBe(filePath);
  });

  it.each(['atlas-vtt/tokens/Orc.png', '/Users/gm/Vault/atlas-vtt/a.png', 'https://example.com/orc.png', 'http://localhost/orc.png', 'data:image/png;base64,AAAA', 'blob:app://f8a1c2/1234', ''])('%j is none', (value) => {
    expect(isResourceUrl(value)).toBe(false);
    expect(resourceUrlToFilePath(value)).toBeNull();
    expect(resourceUrlToVaultPath(value, '/Users/gm/Vault')).toBeNull();
  });

  it('take the prefix this Obsidian names, whatever it is', () => {
    const url = 'obsidian-file://vault/Vault/atlas-vtt/tokens/Orc.png?1';
    expect(isResourceUrl(url)).toBe(false);
    setResourcePathPrefix('obsidian-file://vault/');
    expect(resourceUrlToFilePath(url)).toBe('Vault/atlas-vtt/tokens/Orc.png');
    // The forms of other platforms and sessions are still understood: a map may name one
    expect(resourceUrlToFilePath('app://other-session/Vault/atlas-vtt/a.png')).toBe('Vault/atlas-vtt/a.png');
  });

  it('keep a path that is not valid percent-encoding as it is', () => {
    expect(resourceUrlToFilePath('app://f8a1c2/Vault/atlas-vtt/100%.png?1')).toBe('Vault/atlas-vtt/100%.png');
  });
});

describe('the vault path a resource URL names', () => {
  it.each([
    ['on a Mac', 'app://f8a1c2/Users/gm/Vault/Bestiary/Orc%20Chief.png?17', '/Users/gm/Vault', 'Bestiary/Orc Chief.png'],
    ['on Android', 'http://localhost/_capacitor_file_/storage/emulated/0/Vault/Bestiary/Orc.png?17', '/storage/emulated/0/Vault', 'Bestiary/Orc.png'],
    ['on an iPad', 'capacitor://localhost/_capacitor_file_/var/mobile/Documents/Vault/Bestiary/Orc.png', '/var/mobile/Documents/Vault', 'Bestiary/Orc.png'],
    ['on mobile as documented', 'file:///var/mobile/Documents/Vault/Bestiary/Orc.png', '/var/mobile/Documents/Vault', 'Bestiary/Orc.png'],
  ])('is what follows the vault\'s folder %s', (_name, url, vaultBase, vaultPath) => {
    expect(resourceUrlToVaultPath(url, vaultBase)).toBe(vaultPath);
  });

  it('is the path from Atlas\' folder on where the vault\'s folder is unknown, or the file lies elsewhere', () => {
    const url = 'app://f8a1c2/Users/gm/Vault/atlas-vtt/collections/Cairn/tokens/Orc.png?17';
    expect(resourceUrlToVaultPath(url)).toBe('atlas-vtt/collections/Cairn/tokens/Orc.png');
    expect(resourceUrlToVaultPath(url, '/Users/other/Elsewhere')).toBe('atlas-vtt/collections/Cairn/tokens/Orc.png');
    expect(resourceUrlToVaultPath('app://f8a1c2/Users/gm/atlas-vtt/Vault/atlas-vtt/a.png')).toBe('atlas-vtt/a.png');
  });

  it('is unknown where nothing tells', () => {
    expect(resourceUrlToVaultPath('app://f8a1c2/Users/gm/Notes/Orc.png?17')).toBeNull();
  });
});

describe('normalizeImagePath', () => {
  it.each([
    ['app://f8a1c2/Users/gm/Vault/atlas-vtt/tokens/Goblin%20King.webp?1700000000000', 'atlas-vtt/tokens/Goblin King.webp'],
    ['file:///var/mobile/Documents/Vault/atlas-vtt/tokens/Orc.png?5', 'atlas-vtt/tokens/Orc.png'],
    ['capacitor://localhost/_capacitor_file_/var/mobile/Documents/Vault/atlas-vtt/tokens/Orc.png', 'atlas-vtt/tokens/Orc.png'],
    ['http://localhost/_capacitor_file_/storage/emulated/0/Vault/atlas-vtt/tokens/Orc.png?5', 'atlas-vtt/tokens/Orc.png'],
    ['/Users/gm/Vault/atlas-vtt/tokens/Orc.png', 'atlas-vtt/tokens/Orc.png'],
    ['app://f8a1c2/Users/gm/test-vault/Bestiary/Orc.png?1', 'Bestiary/Orc.png'],
    ['atlas-vtt/tokens/Orc.png', 'atlas-vtt/tokens/Orc.png'],
    ['Bestiary/Orc.png', 'Bestiary/Orc.png'],
    ['https://example.com/orc.png', 'https://example.com/orc.png'],
    ['', ''],
  ])('%j → %j', (path, normalized) => {
    expect(normalizeImagePath(path)).toBe(normalized);
  });

  it('returns what it cannot place as it came, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(normalizeImagePath('app://f8a1c2/Users/gm/Notes/Orc.png?17')).toBe('app://f8a1c2/Users/gm/Notes/Orc.png?17');
    expect(normalizeImagePath('/Users/gm/Notes/Orc.png')).toBe('/Users/gm/Notes/Orc.png');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
