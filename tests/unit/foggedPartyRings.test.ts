import { describe, expect, it } from 'vitest';
import { setPlayerTokenSource } from '../../src/app/characters/playerTokens';
import { fogSparesToken } from '../../src/app/characters/partyTokens';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { FoggedPartyRings } from '../../src/app/pixi/token-renderer/FoggedPartyRings';
import type { TokenEntity } from '../../src/app/types';
import { fogRectangle } from '../helpers/fogOperations';

const vision = { enabled: true } as TokenEntity['vision'];
const token = (id: string, x: number, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', imagePath: `art/${id}.png`, x, y: 50, size: 1, ...changes }) as TokenEntity;

describe('which tokens fog spares', () => {
  it("spares the party: vision tokens and the players' tokens the library or campaign knows, never a hidden one", () => {
    setPlayerTokenSource({ isPlayers: (ref) => ref.imagePath === 'art/bard.png', subscribe: () => () => undefined });
    try {
      expect(fogSparesToken(token('hero', 0, { vision }))).toBe(true);
      expect(fogSparesToken(token('bard', 0))).toBe(true);
      expect(fogSparesToken(token('ogre', 0))).toBe(false);
      expect(fogSparesToken(token('hero', 0, { vision, isHidden: true }))).toBe(false);
      expect(fogSparesToken(token('bard', 0, { isHidden: true }))).toBe(false);
    } finally {
      setPlayerTokenSource(null);
    }
  });
});

describe('the rings over the party under fog', () => {
  const fog = fogCoverage({ paint: fogRectangle({ x: 100, y: 0, width: 200, height: 100 }) });

  function ringsOf(tokens: Record<string, TokenEntity>, coverage: FogCoverage | null): { rings: FoggedPartyRings; tokens: Record<string, TokenEntity> } {
    const state = { tokens };
    const rings = new FoggedPartyRings({ tokens: () => state.tokens, coverage: () => coverage, cellSize: () => 70, accent: () => 0x3366ff });
    return { rings, tokens: state.tokens };
  }

  it('rings a party token the fog covers, and none out of the fog, of a creature, or while there is no fog', () => {
    const tokens = { hero: token('hero', 150, { vision }), scout: token('scout', 20, { vision }), ogre: token('ogre', 200) };
    const { rings } = ringsOf(tokens, fog);
    expect(rings.update()).toBe(true);
    expect(rings.view.children[0]?.getLocalBounds().width).toBeGreaterThan(70);
    expect(rings.update()).toBe(false);
    const none = ringsOf({ scout: token('scout', 20, { vision }), ogre: token('ogre', 200) }, fog).rings;
    expect(none.update()).toBe(false);
    expect(ringsOf(tokens, fogCoverage({})).rings.update()).toBe(false);
    rings.destroy();
    none.destroy();
  });
});
