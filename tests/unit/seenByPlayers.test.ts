import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { NOTHING_SEEN, seenByPlayers } from '../../src/app/perception/framePerception';
import { PlayerSightTokens } from '../../src/app/pixi/token-renderer/PlayerSightTokens';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { TokenEntity } from '../../src/app/types';
import { fogRectangle } from '../helpers/fogOperations';

const token = (id: string, x: number, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', imagePath: '', x, y: 10, ...changes }) as TokenEntity;

/** The players' sight of `tokens` under `fog`, on a canvas that shows the players' picture while `canvas.players` says so. */
function sightOf(tokens: Record<string, TokenEntity>, fog: () => FogCoverage | null, canvas = { players: false }): PlayerSightTokens {
  const sprites: Record<string, TokenGroupContainer> = {};
  for (const t of Object.values(tokens)) {
    const group = Object.assign(new Container(), { tokenId: t.id, tokenData: t, tokenSize: 20, artPath: '', strokeWidth: 0 });
    group.position.set(t.x, t.y);
    sprites[t.id] = group;
  }
  const sight = new PlayerSightTokens({ tokens: () => tokens, sprites: () => sprites, held: () => new Set(), showsPlayers: () => canvas.players });
  sight.setProvider(() => undefined);
  sight.setFogProvider(fog);
  return sight;
}

describe('seenByPlayers', () => {
  const tokens = { seen: token('seen', 10), hidden: token('hidden', 40, { isHidden: true }), covered: token('covered', 200) };
  const noFog = (): FogCoverage => fogCoverage({});

  it('sees every token that is not hidden on an unlit scene without fog, and no hidden or missing one', () => {
    const seen = seenByPlayers(tokens, sightOf(tokens, noFog).framePerception());
    expect(['seen', 'hidden', 'covered', 'missing'].map(seen)).toEqual([true, false, true, false]);
  });

  it('counts a token under committed fog, sensed or unseen as not seen', () => {
    const fog = fogCoverage({ paint: fogRectangle({ x: 150, y: 0, width: 100, height: 100 }) });
    const all = { ...tokens, sensed: token('sensed', 60), unseen: token('unseen', 90) };
    const sight = sightOf(all, () => fog);
    const answers = { seen: 'seen', hidden: 'seen', covered: 'seen', sensed: 'sensed', unseen: 'unseen' } as const;
    const seen = seenByPlayers(all, sight.framePerception((id) => answers[id as keyof typeof answers] ?? 'seen'));
    expect(['seen', 'hidden', 'covered', 'sensed', 'unseen'].map(seen)).toEqual([true, false, false, false, false]);
  });

  it('sees nothing while committed fog cannot be read (no coverage)', () => {
    const seen = seenByPlayers(tokens, sightOf(tokens, () => null).framePerception());
    expect(['seen', 'covered'].map(seen)).toEqual([false, false]);
    expect(NOTHING_SEEN('seen')).toBe(false);
  });
});

describe('the party under committed fog', () => {
  const fog = fogCoverage({ paint: fogRectangle({ x: 150, y: 0, width: 100, height: 100 }) });
  const vision = { enabled: true } as TokenEntity['vision'];

  it('stays in the players\' picture: a vision token under fog is seen, a hidden one and a creature are not', () => {
    const all = { hero: token('hero', 200, { vision }), ogre: token('ogre', 210), sneak: token('sneak', 220, { vision, isHidden: true }) };
    const sight = sightOf(all, () => fog);
    const seen = seenByPlayers(all, sight.framePerception());
    expect(['hero', 'ogre', 'sneak'].map(seen)).toEqual([true, false, false]);
    expect(sight.hides('hero', sight.framePerception())).toBe(false);
    expect(sight.hides('ogre', sight.framePerception())).toBe(true);
  });

  it('stays theirs while the fog cannot be read, where every other token is left out', () => {
    const all = { hero: token('hero', 200, { vision }), ogre: token('ogre', 10) };
    const seen = seenByPlayers(all, sightOf(all, () => null).framePerception());
    expect(['hero', 'ogre'].map(seen)).toEqual([true, false]);
  });
});

describe('PlayerSightTokens.sightIsCurrent', () => {
  it('follows the provider that keeps sight of its own, and holds where sight is read when asked', () => {
    const sight = sightOf({}, () => null);
    expect(sight.sightIsCurrent()).toBe(true);
    let current = false;
    sight.setProvider(() => undefined, () => current);
    expect(sight.sightIsCurrent()).toBe(false);
    current = true;
    expect(sight.sightIsCurrent()).toBe(true);
    sight.setProvider(() => undefined);
    expect(sight.sightIsCurrent()).toBe(true);
  });
});

describe('a roof over the players\' picture', () => {
  const tokens = { open: token('open', 10), roofed: token('roofed', 200), hidden: token('hidden', 210, { isHidden: true }) };
  const underRoof = (point: { x: number }): boolean => point.x > 150;

  it('hides the tokens whose centre it covers in a frame, lit scene or not, with fog or without', () => {
    const sight = sightOf(tokens, () => fogCoverage({}));
    sight.setRoofProvider(underRoof);
    const seen = seenByPlayers(tokens, sight.framePerception());
    expect(['open', 'roofed', 'hidden'].map(seen)).toEqual([true, false, false]);
    expect(seenByPlayers(tokens, sight.framePerception(() => 'sensed'))('open')).toBe(false);
  });

  it('hides them on the canvas only while it shows the players\' view', () => {
    const canvas = { players: false };
    const sight = sightOf(tokens, () => fogCoverage({}), canvas);
    sight.setRoofProvider(underRoof);
    expect(sight.hides('roofed')).toBe(false);
    canvas.players = true;
    expect(sight.hides('roofed')).toBe(true);
    expect(sight.hides('open')).toBe(false);
  });
});
