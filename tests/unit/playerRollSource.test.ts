import { describe, expect, it, vi } from 'vitest';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { PlayerSightTokens } from '../../src/app/pixi/token-renderer/PlayerSightTokens';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { TokenPerception } from '../../src/app/vision/tokenPerception';
import { shownRollTokens, type RollSceneState } from '../../src/app/pixi/playerRollTokens';
import { rollForPlayers, type ShownRollToken } from '../../src/app/services/playerRollSource';
import type { DiceRollOrigin } from '../../src/app/types/diceRollOrigin';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import type { TokenEntity } from '../../src/app/types';
import { fogRectangle } from '../helpers/fogOperations';

const MAP = 'maps/cave.atlasmap';

function token(id: string, changes: Partial<TokenEntity> = {}): TokenEntity {
  return { id, kind: 'character', name: '', x: 100, y: 100, imagePath: `tokens/${id}.webp`, ...changes } as TokenEntity;
}

function scene(tokens: TokenEntity[], changes: Partial<RollSceneState> = {}): RollSceneState {
  return { mapPath: MAP, mapLoaded: true, isMapLoading: false, objects: { tokens: Object.fromEntries(tokens.map((t) => [t.id, t])) }, ...changes };
}

const spritesOf = (tokens: TokenEntity[]): Record<string, TokenGroupContainer> =>
  Object.fromEntries(tokens.map((t) => [t.id, { x: t.x, y: t.y } as TokenGroupContainer]));

/** The players' perception as a frame composes it: lighting, then committed fog. */
function framePerception(tokens: TokenEntity[], lighting: TokenPerception | undefined, coverage: FogCoverage | null | 'none'): TokenPerception | undefined {
  const sight = new PlayerSightTokens({ tokens: () => scene(tokens).objects.tokens, sprites: () => spritesOf(tokens), held: () => new Set() });
  if (coverage !== 'none') sight.setFogProvider(() => coverage, () => false);
  return sight.framePerception(lighting);
}

describe('which tokens a players frame shows for rolls', () => {
  const tokens = [
    token('seen'), token('sensed'), token('unseen'), token('hidden', { isHidden: true }),
    token('fogged', { x: 10, y: 10 }), token('undrawn'),
  ];
  const lighting: TokenPerception = (id) => (id === 'sensed' ? 'sensed' : id === 'unseen' ? 'unseen' : 'seen');
  const drawn = Object.fromEntries(Object.entries(spritesOf(tokens)).filter(([id]) => id !== 'undrawn'));

  it.each([
    ['seen', true],
    ['sensed', false],
    ['unseen', false],
    ['hidden', false],
    ['fogged', false],
    ['undrawn', false],
    ['missing', false],
  ])('%s is named: %s', (id, named) => {
    const perception = framePerception(tokens, lighting, fogCoverage({ paint: fogRectangle() }));
    const shown = shownRollTokens(scene(tokens), MAP, drawn, () => perception, [id]);
    expect(shown.has(id)).toBe(named);
  });

  it('names nothing while committed fog cannot be read', () => {
    const perception = framePerception(tokens, undefined, null);
    expect([...shownRollTokens(scene(tokens), MAP, drawn, () => perception).keys()]).toEqual([]);
  });

  it('names every drawn, nonhidden token on an unlit scene without fog, and lists all without ids', () => {
    const perception = framePerception(tokens, undefined, 'none');
    expect([...shownRollTokens(scene(tokens), MAP, drawn, () => perception).keys()].sort())
      .toEqual(['fogged', 'seen', 'sensed', 'unseen']);
  });

  it('applies committed fog on an unlit scene, and to tokens with vision', () => {
    const party = token('party', { x: 10, y: 10, vision: { enabled: true } } as Partial<TokenEntity>);
    const all = [...tokens, party];
    const perception = framePerception(all, undefined, fogCoverage({ paint: fogRectangle() }));
    const shown = shownRollTokens(scene(all), MAP, spritesOf(all), () => perception);
    expect(shown.has('party')).toBe(false);
    expect(shown.has('fogged')).toBe(false);
    expect(shown.has('seen')).toBe(true);
  });

  it.each([
    ['another map', { mapPath: 'maps/other.atlasmap' }],
    ['no map', { mapPath: null }],
    ['a map loading', { isMapLoading: true }],
    ['a map that failed to load', { mapLoaded: false }],
  ])('names nothing and asks no perception while the store holds %s', (_, changes) => {
    const perception = vi.fn(() => undefined);
    expect(shownRollTokens(scene(tokens, changes), MAP, drawn, perception).size).toBe(0);
    expect(perception).not.toHaveBeenCalled();
  });

  it('reads the name as the nameplate does, and the artwork and ring from the map', () => {
    const named = [
      token('custom', { name: 'Grimfang', statblockPath: 'sb/wolf.md', statblockName: 'Dire Wolf' } as Partial<TokenEntity>),
      token('statblock', { statblockPath: 'sb/wolf.md', statblockName: 'Dire Wolf' } as Partial<TokenEntity>),
      token('unread', { statblockPath: 'sb/wolf.md' } as Partial<TokenEntity>),
      token('plain', { kind: 'token', showRing: false, ringColor: '#00ff00', imagePath: '' } as Partial<TokenEntity>),
      token('ringed', { ringColor: '#aa0000' }),
    ];
    const shown = shownRollTokens(scene(named), MAP, spritesOf(named), () => undefined);
    expect(Object.fromEntries(shown)).toEqual({
      custom: { name: 'Grimfang', imagePath: 'tokens/custom.webp', showRing: true, ringColor: undefined },
      statblock: { name: 'Dire Wolf', imagePath: 'tokens/statblock.webp', showRing: true, ringColor: undefined },
      unread: { name: 'Unknown Creature', imagePath: 'tokens/unread.webp', showRing: true, ringColor: undefined },
      plain: { name: null, imagePath: undefined, showRing: false, ringColor: '#00ff00' },
      ringed: { name: null, imagePath: 'tokens/ringed.webp', showRing: true, ringColor: '#aa0000' },
    });
    // Plain data: a held picture keeps it without the store.
    expect(Object.isFrozen(shown.get('custom'))).toBe(true);
  });
});

const CANARIES = ['canary-token-id', 'Secret/Canary Statblock.md', 'Canary Name', 'canary/raw-image.webp', 'Canary Ability'];

function rawRoll(source: DiceRollResult['source'] | null = {
  type: 'statblock', tokenId: 'canary-token-id', statblockPath: 'Secret/Canary Statblock.md',
  tokenName: 'Canary Name', tokenImagePath: 'canary/raw-image.webp', abilityName: 'Canary Ability',
}): DiceRollResult {
  return {
    id: 'roll-1', timestamp: 5, formula: '2d6+3', rolls: [{ die: 'd6', value: 6, max: 6 }, { die: 'd6', value: 1, max: 6 }],
    modifiers: 3, total: 10, crit: 'high', player: 'GM', ...(source ? { source } : {}),
  };
}

const origin: DiceRollOrigin = { viewId: 'view-a', mapPath: MAP, tokenId: 'canary-token-id' };
const wolf: ShownRollToken = { name: 'Wolf', imagePath: 'tokens/wolf.webp', showRing: true, ringColor: '#aa0000' };
const view = { showNames: true, imageSrc: (path: string): string | null => `app://vault/${path}` };
const sceneShowing = (shown: ShownRollToken | null) => ({ shownToken: vi.fn((_: DiceRollOrigin) => shown) });

function expectNumbersKept(prepared: DiceRollResult, raw: DiceRollResult): void {
  const { source: _source, ...numbers } = raw;
  expect(prepared).toMatchObject(numbers);
}

describe('a roll as the player window shows it', () => {
  it.each([
    ['no origin', undefined, sceneShowing(wolf), rawRoll()],
    ['an origin for another token', { ...origin, tokenId: 'other' }, sceneShowing(wolf), rawRoll()],
    ['no scene to ask', origin, null, rawRoll()],
    ['a token the scene does not show', origin, sceneShowing(null), rawRoll()],
    ['a bare statblock', origin, sceneShowing(wolf), rawRoll({ type: 'statblock', statblockPath: 'Secret/Canary Statblock.md', tokenName: 'Canary Name', abilityName: 'Canary Ability' })],
    ['a source without a token id', origin, sceneShowing(wolf), rawRoll({ type: 'statblock', tokenName: 'Canary Name', tokenImagePath: 'canary/raw-image.webp', abilityName: 'Canary Ability' })],
  ])('names nothing for %s: no token, statblock, image or ability', (_, rollOrigin, rollScene, raw) => {
    const before = structuredClone(raw);
    const prepared = rollForPlayers(raw, rollOrigin, rollScene, view);
    expect(prepared.sourcePresentation).toBeNull();
    expect(prepared.result.source).toEqual({ type: 'statblock' });
    const text = JSON.stringify(prepared);
    for (const canary of CANARIES) expect(text).not.toContain(canary);
    expectNumbersKept(prepared.result, raw);
    expect(raw).toEqual(before);
  });

  it('asks the scene only with an origin that names the rolled token', () => {
    const rollScene = sceneShowing(wolf);
    rollForPlayers(rawRoll(), { ...origin, tokenId: 'other' }, rollScene, view);
    expect(rollScene.shownToken).not.toHaveBeenCalled();
    rollForPlayers(rawRoll(), origin, rollScene, view);
    expect(rollScene.shownToken).toHaveBeenCalledWith(origin);
  });

  it('keeps a roll without a source as it is, naming nothing', () => {
    const raw = rawRoll(null);
    const prepared = rollForPlayers(raw, undefined, sceneShowing(wolf), view);
    expect(prepared.result.source).toBeUndefined();
    expect(prepared.sourcePresentation).toBeNull();
    expectNumbersKept(prepared.result, raw);
  });

  it('shows a token the scene shows by its map name and artwork, with the ability', () => {
    const raw = rawRoll();
    const before = structuredClone(raw);
    const prepared = rollForPlayers(raw, origin, sceneShowing(wolf), view);
    expect(prepared.result.source).toEqual({ type: 'statblock', abilityName: 'Canary Ability' });
    expect(prepared.sourcePresentation).toEqual({
      name: 'Wolf', avatar: { src: 'app://vault/tokens/wolf.webp', showRing: true, ringColor: '#aa0000' },
    });
    const text = JSON.stringify(prepared);
    for (const canary of CANARIES.filter((c) => c !== 'Canary Ability')) expect(text).not.toContain(canary);
    expectNumbersKept(prepared.result, raw);
    expect(raw).toEqual(before);
  });

  it('leaves the name out while nameplates are off, keeping portrait and ability', () => {
    const prepared = rollForPlayers(rawRoll(), origin, sceneShowing(wolf), { ...view, showNames: false });
    expect(prepared.sourcePresentation).toEqual({ name: null, avatar: { src: 'app://vault/tokens/wolf.webp', showRing: true, ringColor: '#aa0000' } });
    expect(prepared.result.source?.abilityName).toBe('Canary Ability');
  });

  it('shows no portrait for a token without map artwork, or artwork that cannot be read, never another picture', () => {
    const imageSrc = vi.fn((_: string): string | null => null);
    expect(rollForPlayers(rawRoll(), origin, sceneShowing({ ...wolf, imagePath: undefined }), { ...view, imageSrc }).sourcePresentation)
      .toEqual({ name: 'Wolf', avatar: null });
    expect(imageSrc).not.toHaveBeenCalled();
    expect(rollForPlayers(rawRoll(), origin, sceneShowing(wolf), { ...view, imageSrc }).sourcePresentation)
      .toEqual({ name: 'Wolf', avatar: null });
    expect(imageSrc).toHaveBeenCalledWith('tokens/wolf.webp');
  });
});
