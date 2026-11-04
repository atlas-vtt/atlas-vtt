import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import {
  dropUnknownConditions,
  dropUnknownConditionsFromJson,
  removeUndefinedConditions,
} from '../../src/app/services/collectionConditionCleanup';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SCENE = 'atlas-vtt/collections/heist/scenes/Vault.atlasmap';
const OTHER_COLLECTION_SCENE = 'atlas-vtt/collections/other/scenes/Inn.atlasmap';
const SNAPSHOT = `${sceneSnapshotFolder('heist', 'scene-vault')}/s1.json`;

const envelope = (conditions: Record<string, string[] | undefined>): Record<string, unknown> => ({
  version: 4,
  state: {
    objects: {
      tokens: Object.fromEntries(Object.entries(conditions).map(([id, list]) => [id, { id, ...(list && { conditions: list }) }])),
    },
  },
});

const tokenConditions = (json: string): Record<string, string[] | undefined> =>
  Object.fromEntries(Object.entries(JSON.parse(json).state.objects.tokens as Record<string, { conditions?: string[] }>)
    .map(([id, token]) => [id, token.conditions]));

afterEach(() => vi.restoreAllMocks());

describe('dropUnknownConditions', () => {
  it('keeps defined conditions and removes the list when none is left', () => {
    const tokens: Record<string, { conditions?: string[] }> = {
      a: { conditions: ['hidden', 'stale'] },
      b: { conditions: ['stale'] },
      c: {},
    };
    expect(dropUnknownConditions(tokens, new Set(['hidden']))).toBe(true);
    expect(tokens).toEqual({ a: { conditions: ['hidden'] }, b: {}, c: {} });
    expect(dropUnknownConditions(tokens, new Set(['hidden']))).toBe(false);
  });

  it('leaves JSON without undefined conditions untouched', () => {
    expect(dropUnknownConditionsFromJson(JSON.stringify(envelope({ a: ['hidden'] })), new Set(['hidden']))).toBeNull();
  });
});

describe('removeUndefinedConditions', () => {
  it('cleans the scenes and snapshots of the collection and nothing else', async () => {
    const { app, files } = createInMemoryApp({
      files: {
        [SCENE]: JSON.stringify(envelope({ a: ['dnd5e-prone', 'dnd5e-restrained'], b: ['dnd5e-prone'] })),
        [OTHER_COLLECTION_SCENE]: JSON.stringify(envelope({ c: ['dnd5e-prone'] })),
        [SNAPSHOT]: JSON.stringify({
          format: 1, id: 's1', name: 'Before the heist', createdAt: 1, ...envelope({ a: ['dnd5e-prone'] }),
        }),
      },
    });
    app.workspace = { getLeavesOfType: () => [] } as any;
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      getCollectionSettings: () => ({ conditions: [{ id: 'dnd5e-restrained', name: 'Restrained', color: '#0d9488' }] }),
      getCollectionForMap: (path: string) => (path.includes('/heist/') ? 'heist' : 'other'),
    } as any);

    await removeUndefinedConditions(app as any, 'heist');

    expect(tokenConditions(files.get(SCENE)!)).toEqual({ a: ['dnd5e-restrained'], b: undefined });
    expect(tokenConditions(files.get(SNAPSHOT)!)).toEqual({ a: undefined });
    expect(tokenConditions(files.get(OTHER_COLLECTION_SCENE)!)).toEqual({ c: ['dnd5e-prone'] });
  });
});
