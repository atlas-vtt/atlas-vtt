import { describe, expect, it } from 'vitest';
import { SoundRoots, type OriginalsChoice, type SoundRootFacts } from '../../../src/app/soundLibrary/SoundRoots';
import { readSharedSoundRoots, type SharedSoundRoots } from '../../../src/app/soundLibrary/soundRootsStore';
import type { SoundKind } from '../../../src/app/sound/soundTypes';

function device(shared: { roots: SharedSoundRoots }, vaultBase: string | null = '/home/gm/vault'): SoundRoots {
  const local = new Map<SoundKind, string>();
  const originals = new Map<SoundKind, OriginalsChoice>();
  const facts: SoundRootFacts = {
    shared: () => shared.roots,
    setShared: (roots) => { shared.roots = roots; },
    onSharedChange: () => () => undefined,
    local: (kind) => local.get(kind) ?? null,
    setLocal: (kind, path) => { if (path) local.set(kind, path); else local.delete(kind); },
    localOriginals: (kind) => originals.get(kind) ?? null,
    setLocalOriginals: (kind, choice) => { if (choice) originals.set(kind, choice); else originals.delete(kind); },
    vaultBase: () => vaultBase,
    realPath: async (path) => path.replace('/link-to-vault', '/home/gm/vault'),
  };
  return new SoundRoots(facts);
}

describe('linking a folder', () => {
  it('stores a choice inside the vault as a vault path, even from the system dialog', async () => {
    const shared = { roots: {} };
    const roots = device(shared);
    await expect(roots.linkChosen('music', '/home/gm/vault/Audio/Music')).resolves.toBe('linked');
    expect(roots.stateOf('music')).toEqual({ kind: 'music', status: 'vault', path: 'Audio/Music' });
    expect(shared.roots).toEqual({ music: { type: 'vault', path: 'Audio/Music' } });
  });

  it('sees through a symbolic link into the vault', async () => {
    const roots = device({ roots: {} });
    await roots.linkChosen('music', '/link-to-vault/Audio');
    expect(roots.stateOf('music')).toMatchObject({ status: 'vault', path: 'Audio' });
  });

  it('keeps a folder outside the vault on this device alone', async () => {
    const shared = { roots: {} };
    const roots = device(shared);
    await roots.linkChosen('music', '/home/gm/Music');
    expect(roots.stateOf('music')).toEqual({ kind: 'music', status: 'external', path: '/home/gm/Music' });
    expect(JSON.stringify(shared.roots)).not.toContain('/home');
  });

  it('shows a second device that it has no link here, without failing', async () => {
    const shared = { roots: {} };
    await device(shared).linkChosen('ambience', '/home/gm/Ambience');
    const other = device(shared);
    expect(other.stateOf('ambience')).toEqual({ kind: 'ambience', status: 'not-linked-here' });
    await other.linkChosen('ambience', 'D:\\Sound');
    expect(other.stateOf('ambience')).toMatchObject({ status: 'external', path: 'D:\\Sound' });
  });

  it('refuses a root inside the other, since a file has one kind', async () => {
    const roots = device({ roots: {} });
    await roots.linkChosen('music', '/home/gm/vault/Audio');
    await expect(roots.linkChosen('ambience', '/home/gm/vault/Audio/Rain')).resolves.toBe('overlap');
    expect(roots.stateOf('ambience').status).toBe('unlinked');
    await roots.linkChosen('music', '/home/gm/Sound');
    await expect(roots.linkChosen('ambience', '/home/gm/Sound/Rain')).resolves.toBe('overlap');
    await expect(roots.linkChosen('ambience', '/home')).resolves.toBe('overlap');
  });

  it('follows a linked vault folder that moves in the vault', async () => {
    const roots = device({ roots: {} });
    roots.linkVault('music', 'Audio/Music');
    roots.followVaultMove('Audio', 'Sound');
    expect(roots.stateOf('music')).toMatchObject({ status: 'vault', path: 'Sound/Music' });
    roots.followVaultMove('Other', 'Elsewhere');
    expect(roots.stateOf('music')).toMatchObject({ path: 'Sound/Music' });
  });

  it('unlinks by forgetting', async () => {
    const shared = { roots: {} };
    const roots = device(shared);
    await roots.linkChosen('music', '/home/gm/Music');
    roots.unlink('music');
    expect(roots.stateOf('music').status).toBe('unlinked');
    expect(shared.roots).toEqual({});
  });
});

it('reads what a hand or a sync tool wrote as no link', () => {
  expect(readSharedSoundRoots({ music: { type: 'vault', path: '../x' }, ambience: { type: 'odd' } })).toEqual({});
  expect(readSharedSoundRoots('nope')).toEqual({});
  expect(readSharedSoundRoots({ ambience: { type: 'external', path: '/x' } })).toEqual({ ambience: { type: 'external' } });
});

describe('the choice about originals', () => {
  it('a vault root keeps its choice for every device', () => {
    const shared = { roots: {} };
    const roots = device(shared);
    roots.linkVault('music', 'Audio');
    roots.setOriginals('music', 'keep');
    expect(shared.roots).toEqual({ music: { type: 'vault', path: 'Audio', originals: 'keep' } });
    expect(device(shared).originalsOf('music')).toBe('keep');
  });

  it('a disk root keeps its choice on this device only', async () => {
    const shared = { roots: {} };
    const roots = device(shared);
    await roots.linkChosen('music', '/home/gm/Music');
    roots.setOriginals('music', 'trash');
    expect(roots.originalsOf('music')).toBe('trash');
    expect(JSON.stringify(shared.roots)).not.toContain('trash');
  });

  it('a new link has no choice', () => {
    const roots = device({ roots: {} });
    roots.linkVault('music', 'Audio');
    roots.setOriginals('music', 'trash');
    roots.linkVault('music', 'Other');
    expect(roots.originalsOf('music')).toBeNull();
  });

  it('unlink forgets the choice', async () => {
    const roots = device({ roots: {} });
    await roots.linkChosen('music', '/home/gm/Music');
    roots.setOriginals('music', 'keep');
    roots.unlink('music');
    await roots.linkChosen('music', '/home/gm/Music');
    expect(roots.originalsOf('music')).toBeNull();
  });

  it('a moved vault root keeps its choice', () => {
    const roots = device({ roots: {} });
    roots.linkVault('music', 'Audio/Music');
    roots.setOriginals('music', 'trash');
    roots.followVaultMove('Audio', 'Sound');
    expect(roots.originalsOf('music')).toBe('trash');
  });

  it('an unreadable choice is no choice', () => {
    expect(readSharedSoundRoots({ music: { type: 'vault', path: 'A', originals: 'delete' } })).toEqual({ music: { type: 'vault', path: 'A' } });
    expect(readSharedSoundRoots({ music: { type: 'vault', path: 'A', originals: 'keep' } })).toEqual({ music: { type: 'vault', path: 'A', originals: 'keep' } });
  });
});
