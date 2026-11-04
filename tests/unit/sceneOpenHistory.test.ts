import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { byLastOpened, SceneOpenHistory, type SceneRecency } from '../../src/app/services/sceneOpenHistory';

const scenes = [
  { id: 'scene-inn', type: 'scene', data: { mapPath: 'atlas-vtt/collections/Cairn/scenes/Inn.atlasmap' } },
  { id: 'scene-caves', type: 'scene', data: { mapPath: 'atlas-vtt/collections/Cairn/scenes/Caves.atlasmap' } },
];

function vaultApp(initial?: unknown): App & { stored: Map<string, unknown>; trigger: ReturnType<typeof vi.fn> } {
  const stored = new Map<string, unknown>();
  if (initial !== undefined) stored.set('atlas-vtt:scene-opens', initial);
  const trigger = vi.fn();
  const app = {
    stored,
    trigger,
    loadLocalStorage: (key: string) => stored.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => stored.set(key, value),
    workspace: { trigger },
  } as unknown as App & { stored: Map<string, unknown>; trigger: ReturnType<typeof vi.fn> };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getAssets: () => Promise.resolve(scenes),
  } as unknown as AssetService);
  return app;
}

describe('SceneOpenHistory', () => {
  it('records the scene record whose map file was opened and announces it', async () => {
    vi.useFakeTimers({ now: 5000 });
    const app = vaultApp();
    await SceneOpenHistory.forApp(app).recordOpened('atlas-vtt/collections/Cairn/scenes/Caves.atlasmap');

    expect(SceneOpenHistory.forApp(app).openedAt('scene-caves')).toBe(5000);
    expect(SceneOpenHistory.forApp(app).openedAt('scene-inn')).toBeNull();
    expect(app.stored.get('atlas-vtt:scene-opens')).toEqual({ 'scene-caves': 5000 });
    expect(app.trigger).toHaveBeenCalledWith('atlas-vtt:scene-opened', 'scene-caves');
    vi.useRealTimers();
  });

  it('ignores a file no scene record names', async () => {
    const app = vaultApp();
    await SceneOpenHistory.forApp(app).recordOpened('atlas-vtt/assets/stray.atlasmap');

    expect(app.stored.has('atlas-vtt:scene-opens')).toBe(false);
    expect(app.trigger).not.toHaveBeenCalled();
  });

  it('reads what an earlier session stored and drops what is not a time', () => {
    const app = vaultApp({ 'scene-inn': 1200, 'scene-caves': 'yesterday' });

    expect(SceneOpenHistory.forApp(app).openedAt('scene-inn')).toBe(1200);
    expect(SceneOpenHistory.forApp(app).openedAt('scene-caves')).toBeNull();
  });
});

describe('byLastOpened', () => {
  const scene = (name: string, openedAt: number | null, modifiedAt: number): SceneRecency & { name: string } =>
    ({ name, openedAt, modifiedAt });

  it('puts the last opened scene first, even when another was imported later', () => {
    const ordered = [
      scene('imported yesterday', null, 9000),
      scene('played last week', 3000, 1000),
      scene('played today', 8000, 2000),
      scene('imported long ago', null, 500),
    ].sort(byLastOpened);

    expect(ordered.map(({ name }) => name)).toEqual([
      'played today', 'played last week', 'imported yesterday', 'imported long ago',
    ]);
  });
});
