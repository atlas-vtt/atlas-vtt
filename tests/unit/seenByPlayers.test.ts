import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { NOTHING_SEEN, PlayerSightTokens, seenByPlayers } from '../../src/app/pixi/token-renderer/PlayerSightTokens';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { TokenEntity } from '../../src/app/types';
import { fogRectangle } from '../helpers/fogOperations';

const token = (id: string, x: number, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', imagePath: '', x, y: 10, ...changes }) as TokenEntity;

function sightOf(tokens: Record<string, TokenEntity>, fog: () => FogCoverage | null, players = { active: false, playerView: false }): PlayerSightTokens {
  const sprites: Record<string, TokenGroupContainer> = {};
  for (const t of Object.values(tokens)) {
    const group = Object.assign(new Container(), { tokenId: t.id, tokenData: t, tokenSize: 20, artPath: '', strokeWidth: 0 });
    group.position.set(t.x, t.y);
    sprites[t.id] = group;
  }
  const sight = new PlayerSightTokens({ tokens: () => tokens, sprites: () => sprites, held: () => new Set() });
  sight.setProvider(() => undefined, () => players.active);
  sight.setFogProvider(fog, () => players.playerView);
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

describe('PlayerSightTokens.showsPlayers', () => {
  it('is on while the canvas shows the players\' view: session view, or the peek', () => {
    const players = { active: false, playerView: false };
    const sight = sightOf({}, () => null, players);
    expect(sight.showsPlayers()).toBe(false);
    players.playerView = true;
    expect(sight.showsPlayers()).toBe(true);
    players.playerView = false;
    players.active = true;
    expect(sight.showsPlayers()).toBe(true);
  });
});
