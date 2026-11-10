import { describe, expect, it, vi } from 'vitest';
import { partyOf } from '../../src/app/campaigns/campaignParty';
import { campaignsMatching } from '../../src/app/campaigns/campaignSearch';
import type { Campaign } from '../../src/app/campaigns/campaignTypes';
import { placedTokensIn, scenePlacedTokens } from '../../src/app/campaigns/scenePlacedTokens';
import { fanTurns } from '../../src/app/react/components/dashboard/PartyFaces';
import type { TokenAsset } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const record = (id: string, extra: Partial<TokenAsset> = {}): TokenAsset => ({
  id, name: id.toUpperCase(), type: 'token', imagePath: `art/${id}.webp`, tags: [], collection: 'c', createdAt: 1, modifiedAt: 1, ...extra,
});

const sceneText = (tokens: Record<string, unknown>): string => JSON.stringify({ version: 4, state: { mapPath: 'm', objects: { tokens } } });

describe('the party on a scene', () => {
  const records = [
    record('aria', { playerCharacter: true, thumbnailPath: 'thumbs/aria.webp' }),
    record('brom', { playerCharacter: true, showRing: false }),
    record('olm'),
    record('copy', { playerCharacter: true, imagePath: 'art/shared.webp' }),
  ];

  it('keeps the players\' characters once each, in the order they stand, drawn as the scene drew them', () => {
    expect(partyOf([
      { imagePath: 'art/olm.webp', assetId: 'olm' },
      { imagePath: 'art/elsewhere.webp', assetId: 'brom' },
      { imagePath: 'art/aria.webp', ringColor: '#ff0000' },
      { imagePath: 'art/aria.webp', assetId: 'aria', ringColor: '#00ff00' },
      { imagePath: 'art/unknown.webp' },
    ], records)).toEqual([
      { id: 'brom', name: 'BROM', artPath: 'art/brom.webp', showRing: false },
      { id: 'aria', name: 'ARIA', artPath: 'thumbs/aria.webp', showRing: true, ringColor: '#ff0000' },
    ]);
  });

  it('finds a token by its art when the record it names is gone, and has nobody where nobody stands', () => {
    expect(partyOf([{ imagePath: 'art/shared.webp', assetId: 'deleted' }], records).map((member) => member.id)).toEqual(['copy']);
    expect(partyOf([], records)).toEqual([]);
  });
});

describe('the tokens a scene file places', () => {
  it('reads art, record and ring colour, and leaves out what is not a token', () => {
    expect(placedTokensIn(sceneText({
      a: { imagePath: 'art/aria.webp', assetId: 'aria', ringColor: '#ffaa00', hp: 3 },
      b: { imagePath: 'art/brom.webp', ringColor: 'url(javascript:1)', assetId: 7 },
      c: { name: 'no art' },
      d: 'token',
    }))).toEqual([
      { imagePath: 'art/aria.webp', assetId: 'aria', ringColor: '#ffaa00' },
      { imagePath: 'art/brom.webp' },
    ]);
    expect(placedTokensIn('{ not json')).toEqual([]);
    expect(placedTokensIn(JSON.stringify({ state: { objects: { tokens: [] } } }))).toEqual([]);
  });

  it('reads a scene file again only once it changed, and has none for a file that is not there', async () => {
    const path = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
    const { app, files } = createInMemoryApp({ files: { [path]: sceneText({ a: { imagePath: 'art/aria.webp' } }) } });
    expect(await scenePlacedTokens(app, path)).toEqual([{ imagePath: 'art/aria.webp' }]);
    expect(await scenePlacedTokens(app, path)).toEqual([{ imagePath: 'art/aria.webp' }]);
    expect(vi.mocked(app.vault.cachedRead)).toHaveBeenCalledTimes(1);
    await app.vault.process(app.vault.getFileByPath(path)!, () => sceneText({ b: { imagePath: 'art/brom.webp' } }));
    expect(files.get(path)).toContain('brom');
    expect(await scenePlacedTokens(app, path)).toEqual([{ imagePath: 'art/brom.webp' }]);
    expect(await scenePlacedTokens(app, 'atlas-vtt/missing.atlasmap')).toBeNull();
  });
});

describe('the fan of ringed faces', () => {
  it('turns evenly about the middle face, opening no wider than a few degrees', () => {
    expect(fanTurns(0)).toEqual([]);
    expect(fanTurns(1)).toEqual([0]);
    expect(fanTurns(3)).toEqual([-8, 0, 8]);
    const many = fanTurns(9);
    expect(many[0]).toBe(-12);
    expect(many[8]).toBe(12);
  });
});

describe('searching campaigns', () => {
  const campaigns: Campaign[] = [
    { id: 'a', name: 'Rise of the Blood Olms', createdAt: 1, description: 'Blue Mouth Caves, below the Hollow Oak.' },
    { id: 'b', name: 'The Witherwild', createdAt: 2 },
    { id: 'c', name: 'Dolmenwood', createdAt: 3, description: 'A hex crawl.' },
  ];
  const names = (search: string): string[] => campaignsMatching(campaigns, search).map((campaign) => campaign.id);

  it('finds every word in the name or description, in any letter case', () => {
    expect(names('')).toEqual(['a', 'b', 'c']);
    expect(names('   ')).toEqual(['a', 'b', 'c']);
    expect(names('WITHER')).toEqual(['b']);
    expect(names('hollow olms')).toEqual(['a']);
    expect(names('hex wood')).toEqual(['c']);
    expect(names('hex olms')).toEqual([]);
  });
});
