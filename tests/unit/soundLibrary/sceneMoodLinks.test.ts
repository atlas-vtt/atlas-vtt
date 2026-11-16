import { afterEach, describe, expect, it, vi } from 'vitest';
import { sceneSoundOfText } from '../../../src/app/soundLibrary/sceneSound';
import { SceneMoodLinks, sceneOfMood, type LinkingScene } from '../../../src/app/soundLibrary/SceneMoodLinks';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const sceneText = (sound?: Record<string, unknown>): string => JSON.stringify({ state: { schema: 'atlas-vtt', objects: { tokens: {} }, ...(sound && { sound }) }, version: 4 });

let vault: InMemoryApp | null = null;
afterEach(() => {
  if (vault) SceneMoodLinks.release(vault.app);
  vault = null;
});

describe('the links a scene file holds', () => {
  it('are its state\'s sound, read as the scene reads them', () => {
    expect(sceneSoundOfText(sceneText({ mood: 'm1', combatMood: 'm2' }))).toEqual({ mood: 'm1', combatMood: 'm2' });
    expect(sceneSoundOfText(sceneText({ mood: '' }))).toBeNull();
    expect(sceneSoundOfText(sceneText())).toBeNull();
  });

  it('are none in a file that is no scene\'s, or names a token sound elsewhere', () => {
    expect(sceneSoundOfText('{"state": {"sound": ')).toBeNull();
    expect(sceneSoundOfText(JSON.stringify({ state: { objects: { audio: { a: { sound: 'x' } } } } }))).toBeNull();
  });
});

describe('which scenes link which moods', () => {
  it('reads every scene file once, and follows the vault', async () => {
    vault = createInMemoryApp({ files: { 'A.atlasmap': sceneText({ mood: 'm1' }), 'B.atlasmap': sceneText(), 'notes.md': '"sound"' } });
    const links = SceneMoodLinks.forApp(vault.app);
    const heard = vi.fn();
    links.onChange(heard);
    await vi.waitFor(() => expect(links.scenes().map((scene) => scene.path)).toEqual(['A.atlasmap']));
    expect(vi.mocked(vault.app.vault.cachedRead).mock.calls.map(([file]) => file.path).sort()).toEqual(['A.atlasmap', 'B.atlasmap']);

    vault.files.set('B.atlasmap', sceneText({ combatMood: 'm2' }));
    vault.emit('modify', vault.app.vault.getFileByPath('B.atlasmap'));
    await vi.waitFor(() => expect(links.scenes().map((scene) => scene.path).sort()).toEqual(['A.atlasmap', 'B.atlasmap']));

    vault.files.delete('A.atlasmap');
    vault.emit('delete', { path: 'A.atlasmap' });
    expect(links.scenes().map((scene) => scene.path)).toEqual(['B.atlasmap']);
    expect(heard).toHaveBeenCalled();
  });
});

describe('the scene that speaks for a mood', () => {
  it('is one that plays it before one that plays it in fights, the latest first', () => {
    const scenes: LinkingScene[] = [
      { path: 'new.atlasmap', mtime: 3, sound: { combatMood: 'm1' } },
      { path: 'mid.atlasmap', mtime: 2, sound: { mood: 'm1' } },
      { path: 'old.atlasmap', mtime: 1, sound: { mood: 'm1', combatMood: 'm2' } },
    ];
    expect([...sceneOfMood(scenes)]).toEqual([['m1', 'mid.atlasmap'], ['m2', 'old.atlasmap']]);
  });
});
