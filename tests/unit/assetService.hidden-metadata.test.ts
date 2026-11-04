import { beforeEach, describe, expect, it } from 'vitest';

import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

describe('AssetService hidden metadata saves', () => {
  beforeEach(() => {
    (AssetService as any).instance = null;
  });

  it('persists metadata without failing when hidden metadata path exists but is not indexed', async () => {
    const { app } = createInMemoryApp();
    const service = AssetService.getInstance(app as any);

    await expect(
      service.addTokenAsset({
        name: 'Goblin',
        imagePath: 'atlas-vtt/assets/goblin.webp',
        tags: [],
        collection: 'default',
      })
    ).resolves.toMatchObject({ type: 'token', name: 'Goblin' });
  });

  it('registers on-disk collections missing from metadata', async () => {
    const { app } = createInMemoryApp({
      folders: [
        'atlas-vtt/collections',
        'atlas-vtt/collections/default',
      ],
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {},
          version: 2,
        }),
        'atlas-vtt/collections/test/scenes/Test Collection Scene.atlasmap': JSON.stringify({
          state: {
            background: 'atlas-vtt/assets/test-collection-scene.webp',
          },
        }),
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    const collections = await service.getCollections();

    expect(collections.some((collection) => collection.id === 'test')).toBe(true);

    await expect(
      service.addTokenAsset({
        name: 'Recovered Token',
        imagePath: 'atlas-vtt/assets/recovered-token.webp',
        tags: [],
        collection: 'test',
      })
    ).resolves.toMatchObject({ collection: 'test', type: 'token' });
  });

  it('rebuilds scene assets from atlasmap files when metadata has no assets', async () => {
    const { app } = createInMemoryApp({
      folders: [
        'atlas-vtt/collections',
        'atlas-vtt/collections/default',
        'atlas-vtt/collections/default/scenes',
      ],
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {},
          version: 2,
        }),
        'atlas-vtt/collections/default/scenes/Recovered Scene.atlasmap': JSON.stringify({
          state: {
            background: 'atlas-vtt/assets/recovered-scene.webp',
          },
        }),
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    const scenes = await service.getAssets('default', 'scene');

    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({
      type: 'scene',
      name: 'Recovered Scene',
      collection: 'Default',
    });
  });

  it('recovers token assets from collection token folders when metadata has other assets but no tokens', async () => {
    const { app } = createInMemoryApp({
      folders: [
        'atlas-vtt/collections',
        'atlas-vtt/collections/default',
      ],
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {
            'map-1': {
              id: 'map-1',
              type: 'map',
              name: 'Existing Map',
              mapFilePath: 'atlas-vtt/assets/existing-map.webp',
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          version: 2,
        }),
        'atlas-vtt/assets/existing-map.webp': 'map-bytes',
        'atlas-vtt/collections/default/tokens/recovered-token.webp': 'token-bytes',
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    const tokens = await service.getAssets('default', 'token');

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: 'token',
      imagePath: 'atlas-vtt/collections/Default/tokens/recovered-token.webp',
      collection: 'Default',
    });
  });

  it('strips generated timestamp/random suffixes when recovering token names from filenames', async () => {
    const { app } = createInMemoryApp({
      folders: [
        'atlas-vtt/collections',
        'atlas-vtt/collections/default',
      ],
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {
            'map-1': {
              id: 'map-1',
              type: 'map',
              name: 'Existing Map',
              mapFilePath: 'atlas-vtt/assets/existing-map.webp',
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          version: 2,
        }),
        'atlas-vtt/assets/existing-map.webp': 'map-bytes',
        'atlas-vtt/collections/default/tokens/Goodberry_1748296015230_72a74x.webp': 'token-bytes',
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    const tokens = await service.getAssets('default', 'token');

    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.name).toBe('Goodberry');
  });

  it('normalizes previously recovered token names that already include generated suffixes', async () => {
    const { app } = createInMemoryApp({
      folders: [
        'atlas-vtt/collections',
        'atlas-vtt/collections/default',
      ],
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {
            'token-recovered-goodberry': {
              id: 'token-recovered-goodberry',
              type: 'token',
              name: 'Goodberry 1748296015230 72a74x',
              imagePath: 'atlas-vtt/collections/default/tokens/Goodberry_1748296015230_72a74x.webp',
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          version: 2,
        }),
        'atlas-vtt/collections/default/tokens/Goodberry_1748296015230_72a74x.webp': 'token-bytes',
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    const tokens = await service.getAssets('default', 'token');

    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.name).toBe('Goodberry');
  });

  it('keeps hidden metadata in sync when legacy metadata file also exists', async () => {
    const emptyMetadata = JSON.stringify({
      collections: {
        default: {
          id: 'default',
          name: 'Default',
          description: 'Default collection',
          tags: {},
          createdAt: 1,
          modifiedAt: 1,
        },
      },
      assets: {},
      version: 2,
    });
    const { app, files } = createInMemoryApp({
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': emptyMetadata,
        'atlas-vtt/assets-metadata.json': emptyMetadata,
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.addTokenAsset({
      name: 'Persisted Token',
      imagePath: 'atlas-vtt/assets/persisted-token.webp',
      tags: [],
      collection: 'default',
    });

    const hidden = JSON.parse(files.get('atlas-vtt/.atlas-data/assets-metadata.json') ?? emptyMetadata);
    expect(Object.values(hidden.assets)).toHaveLength(1);
  });

  it('does not recover encounter thumbnails as token assets', async () => {
    const { app } = createInMemoryApp({
      folders: [
        'atlas-vtt/collections',
        'atlas-vtt/collections/default',
        'atlas-vtt/collections/default/tokens',
      ],
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {},
          version: 2,
        }),
        'atlas-vtt/collections/default/tokens/goblin.webp': 'token-bytes',
        'atlas-vtt/assets/encounter-thumbnails/encounter-1.png': 'thumb-bytes',
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    const tokens = await service.getAssets('default', 'token');

    expect(tokens).toHaveLength(1);
    expect((tokens[0] as any).imagePath).toBe('atlas-vtt/collections/Default/tokens/goblin.webp');
  });

  it('drops stale token metadata when file is missing and keeps recovered token only once', async () => {
    const { app } = createInMemoryApp({
      folders: [
        'atlas-vtt/collections',
        'atlas-vtt/collections/default',
        'atlas-vtt/collections/default/tokens',
      ],
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {
            'token-legacy': {
              id: 'token-legacy',
              type: 'token',
              name: 'Goblin',
              imagePath: 'atlas-vtt/assets/goblin.webp',
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          version: 2,
        }),
        'atlas-vtt/collections/default/tokens/goblin.webp': 'moved-token-bytes',
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    const tokens = await service.getAssets('default', 'token');

    expect(tokens).toHaveLength(1);
    expect((tokens[0] as any).imagePath).toBe('atlas-vtt/collections/Default/tokens/goblin.webp');
  });

  it('prunes previously recovered non-token global images from token metadata', async () => {
    const { app } = createInMemoryApp({
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {
            'token-recovered-bad': {
              id: 'token-recovered-bad',
              type: 'token',
              name: 'Encounter Thumb',
              imagePath: 'atlas-vtt/assets/encounter-thumbnails/encounter-1.png',
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
            },
            'token-valid': {
              id: 'token-valid',
              type: 'token',
              name: 'Goblin',
              imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp',
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          version: 2,
        }),
        'atlas-vtt/assets/encounter-thumbnails/encounter-1.png': 'thumb',
        'atlas-vtt/collections/default/tokens/goblin.webp': 'goblin',
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    const tokens = await service.getAssets('default', 'token');

    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.id).toBe('token-valid');
  });

  it('updates encounter token references when a token image path changes', async () => {
    const { app } = createInMemoryApp({
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {
            'token-1': {
              id: 'token-1',
              type: 'token',
              name: 'Goblin',
              imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp',
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
            },
            'enc-1': {
              id: 'enc-1',
              type: 'encounter',
              name: 'Goblin Patrol',
              tokens: [
                { id: 'token-1', name: 'Goblin', imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp' },
              ],
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
              data: {
                tokens: [
                  { id: 'token-1', name: 'Goblin', imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp' },
                ],
              },
            },
          },
          version: 2,
        }),
        'atlas-vtt/collections/default/tokens/goblin.webp': 'goblin',
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    await service.updateAsset('token-1', {
      imagePath: 'atlas-vtt/collections/default/tokens/folder/goblin.webp',
      name: 'Goblin Raider',
    });

    const encounters = await service.getAssets('default', 'encounter');
    const encounter = encounters[0] as any;
    expect(encounter.tokens[0].imagePath).toBe('atlas-vtt/collections/default/tokens/folder/goblin.webp');
    expect(encounter.tokens[0].name).toBe('Goblin Raider');
    expect(encounter.data.tokens[0].imagePath).toBe('atlas-vtt/collections/default/tokens/folder/goblin.webp');
  });

  it('deletes encounters left empty when their only token is deleted', async () => {
    const { app, files } = createInMemoryApp({
      files: {
        'atlas-vtt/.atlas-data/assets-metadata.json': JSON.stringify({
          collections: {
            default: {
              id: 'default',
              name: 'Default',
              description: 'Default collection',
              tags: {},
              createdAt: 1,
              modifiedAt: 1,
            },
          },
          assets: {
            'token-1': {
              id: 'token-1',
              type: 'token',
              name: 'Goblin',
              imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp',
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
            },
            'enc-1': {
              id: 'enc-1',
              type: 'encounter',
              name: 'Goblin Patrol',
              tokens: [
                { id: 'token-1', name: 'Goblin', imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp' },
              ],
              tags: [],
              collection: 'default',
              createdAt: 1,
              modifiedAt: 1,
              data: {
                tokens: [
                  { id: 'token-1', name: 'Goblin', imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp' },
                ],
              },
            },
          },
          version: 2,
        }),
        'atlas-vtt/collections/default/tokens/goblin.webp': 'goblin',
      },
    });
    const service = AssetService.getInstance(app as any);

    await service.initialize();
    await service.deleteAsset('token-1');

    // The art, the token's record file and the emptied encounter's record file.
    expect(app.fileManager.trashFile).toHaveBeenCalledTimes(3);
    expect(files.has('atlas-vtt/collections/default/tokens/goblin.webp')).toBe(false);
    expect(files.has('atlas-vtt/collections/default/tokens/token-1.json')).toBe(false);
    expect([...files.keys()].some((path) => path.includes('/encounters/'))).toBe(false);

    expect(await service.getAssets('default', 'encounter')).toEqual([]);
  });
});
