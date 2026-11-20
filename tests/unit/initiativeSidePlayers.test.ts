import { afterEach, describe, expect, it } from 'vitest';
import { givenTokens } from '../../src/app/campaigns/players/givenTokens';
import type { CampaignPlayer } from '../../src/app/campaigns/players/playersFile';
import { KnownPlayerTokens, type PlayerTokenFacts } from '../../src/app/characters/knownPlayerTokens';
import { playerTokensRevision, setPlayerTokenSource, subscribePlayerTokens } from '../../src/app/characters/playerTokens';
import { cardGroupOf } from '../../src/app/initiative/cardGroups';
import { sideOf } from '../../src/app/initiative/sides';
import { trackerSegments } from '../../src/app/initiative/trackerSegments';
import { turnTokenIds } from '../../src/app/initiative/turnHolders';
import type { TokenAsset } from '../../src/app/services/AssetService';
import { entryTokenOf } from '../../src/app/services/playerInitiativeList';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';

const record = (id: string, playerCharacter?: true): TokenAsset => ({
  id, type: 'token', name: id, imagePath: `art/${id}.webp`, tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1, ...(playerCharacter && { playerCharacter }),
});
const token = (id: string, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: `art/${id}.webp`, assetId: id, ...changes } as TokenEntity);
/** A token placed from no library token, or before tokens named theirs. */
const loose = (id: string): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: `art/${id}.webp` });
const entry = (tokenId: string, order: number): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 0, initiativeModifier: 0, imagePath: `art/${tokenId}.webp`, isActive: false, isNPC: true, order,
});
const player = (id: string, characters: string[]): CampaignPlayer => ({ id, name: id, code: '123456', characters });

/** The app's source as the plugin sets it up, over a library and what a played campaign's players were given. */
function known(facts: Partial<PlayerTokenFacts> & { library: PlayerTokenFacts['library'] }): KnownPlayerTokens {
  const source = new KnownPlayerTokens({ given: () => null, ...facts });
  setPlayerTokenSource(source);
  return source;
}

afterEach(() => setPlayerTokenSource(null));

describe('the side of a token nobody gave one', () => {
  it('is the players\' for a player character of the library, whether or not its token sees', () => {
    known({ library: () => [record('ranger', true), record('wolf')] });
    expect(sideOf(token('ranger'))).toBe('players');
    expect(sideOf(token('ranger', { vision: { enabled: false } }))).toBe('players');
    expect(sideOf(token('wolf'))).toBe('opponents');
    expect(sideOf(token('wolf', { vision: { enabled: true } }))).toBe('players');
  });

  it('finds the character of a token placed before tokens named their library token by its art', () => {
    known({ library: () => [record('ranger', true)] });
    expect(sideOf(loose('ranger'))).toBe('players');
    expect(sideOf(loose('other'))).toBe('opponents');
  });

  it('is the players\' for what a player of the played campaign was given, and only while it is played', () => {
    let played = true;
    const given = givenTokens([player('ada', ['bard'])], { owners: { loose: 'ada', stray: 'nobody' }, playerTokens: {} });
    const source = known({ library: () => [record('bard'), record('wolf')], given: () => (played ? given : null) });
    expect(sideOf(token('on-another-scene', { assetId: 'bard' }))).toBe('players');
    expect(sideOf(loose('loose'))).toBe('players');
    expect(sideOf(loose('stray'))).toBe('opponents');
    expect(sideOf(token('wolf'))).toBe('opponents');
    played = false;
    source.changed();
    expect(sideOf(token('on-another-scene', { assetId: 'bard' }))).toBe('opponents');
  });

  it('never wins over the side the GM gave the token', () => {
    known({ library: () => [record('ranger', true)] });
    expect(sideOf(token('ranger', { side: 'opponents' }))).toBe('opponents');
    expect(sideOf(token('ranger', { side: 'side-abc123' }), ['players', 'opponents', 'side-abc123'])).toBe('side-abc123');
    // A side the fight does not know falls back to the default
    expect(sideOf(token('ranger', { side: 'side-abc123' }))).toBe('players');
  });

  it('is the opponents\' for every token that does not see while nothing knows the library', () => {
    expect(sideOf(token('ranger'))).toBe('opponents');
  });
});

describe('everything that reads a side', () => {
  const tokens = { ranger: token('ranger'), wolf: token('wolf') };
  const entries = [entry('wolf', 0), entry('ranger', 1)];
  const sides = (['players', 'opponents'] as const).map((id) => ({ id, name: id, roll: null, active: false }));

  it('gives a player character without vision the same side: both lists, the turn and the deal', () => {
    known({ library: () => [record('ranger', true), record('wolf')] });
    const groups = trackerSegments(entries, tokens, { bySides: true, sides, fightRuns: false, round: 0, fromTurn: false, collapsed: false })
      .flatMap((segment) => (segment.kind === 'round' ? [] : [[segment.side?.id, segment.items.map((item) => item.tokenId)]]));
    expect(groups).toEqual([['players', ['ranger']], ['opponents', ['wolf']]]);
    expect([entryTokenOf(tokens.ranger, []).side, entryTokenOf(tokens.wolf, []).side]).toEqual(['players', 'opponents']);
    const fight = { ...createDefaultInitiativeState(), isActive: true, round: 1, entries, sides: { first: 'players', active: 'players' } as const };
    expect(turnTokenIds(fight, tokens)).toEqual(['ranger']);
    // Look-alikes share a card only among those who are not the players'
    expect(entries.map(cardGroupOf(tokens, true))).toEqual(['art:art/wolf.webp', 'entry:e-ranger']);
  });
});

describe('what knows the players\' tokens', () => {
  it('remembers its answers until it is told the library changed, and tells whoever listens', () => {
    let reads = 0;
    let library = [record('ranger')];
    const source = known({ library: () => { reads++; return library; } });
    let heard = 0;
    const stop = subscribePlayerTokens(() => heard++);
    const before = playerTokensRevision();
    expect([sideOf(token('ranger')), sideOf(token('ranger')), reads]).toEqual(['opponents', 'opponents', 1]);
    library = [record('ranger', true)];
    expect(sideOf(token('ranger'))).toBe('opponents');
    source.changed();
    expect([sideOf(token('ranger')), reads, heard]).toEqual(['players', 2, 1]);
    expect(playerTokensRevision()).toBeGreaterThan(before);
    stop();
    source.changed();
    expect(heard).toBe(1);
  });

  it('reads who was given what from the campaign\'s players, leaving out a token whose owner is no player of it', () => {
    const given = givenTokens([player('ada', ['bard', 'bear']), player('bo', [])], { owners: { loose: 'bo', stray: 'gone' }, playerTokens: {} });
    expect([[...given.characters], [...given.tokens]]).toEqual([['bard', 'bear'], ['loose']]);
  });
});
