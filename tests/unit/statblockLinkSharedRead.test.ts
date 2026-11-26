// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetService, type TokenAsset } from '../../src/app/services/AssetService';
import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';

const token = (imagePath: string, statblockPath?: string): TokenAsset => ({
  id: imagePath, type: 'token', name: imagePath, collection: 'c', imagePath, createdAt: 0, modifiedAt: 0, ...(statblockPath && { statblockPath }),
} as TokenAsset);

function linkService(assets: TokenAsset[][]): { service: TokenStatblockLinkService; reads: ReturnType<typeof vi.fn> } {
  const reads = vi.fn(() => Promise.resolve(assets.shift() ?? []));
  Reflect.set(AssetService, 'instance', { initialize: () => Promise.resolve(), getTokenAssets: reads });
  Reflect.set(TokenStatblockLinkService, 'instance', null);
  return { service: TokenStatblockLinkService.getInstance({} as App), reads };
}

afterEach(() => {
  Reflect.set(AssetService, 'instance', null);
  Reflect.set(TokenStatblockLinkService, 'instance', null);
});

describe('TokenStatblockLinkService.getStatblockLinkedToToken', () => {
  it('reads the token assets once for the tokens of a map that ask at once', async () => {
    const { service, reads } = linkService([[token('a.webp', 'A.md'), token('b.webp')]]);
    const linked = await Promise.all(['a.webp', 'b.webp', 'a.webp'].map((path) => service.getStatblockLinkedToToken(path)));
    expect(linked).toEqual(['A.md', null, 'A.md']);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('reads them again once that read is over, so a later ask sees later links', async () => {
    const { service, reads } = linkService([[token('a.webp')], [token('a.webp', 'A.md')]]);
    expect(await service.getStatblockLinkedToToken('a.webp')).toBeNull();
    expect(await service.getStatblockLinkedToToken('a.webp')).toBe('A.md');
    expect(reads).toHaveBeenCalledTimes(2);
  });
});
