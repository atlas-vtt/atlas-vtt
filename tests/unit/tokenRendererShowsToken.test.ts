import { describe, expect, it } from 'vitest';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';

/** `showsToken` on a renderer whose canvas is in the GM's or the players' perspective, the players' sight leaving out `unseen`. */
function showsToken(tokenId: string, playersView: boolean, unseen: readonly string[] = []): boolean {
  const tokens = { orc: { id: 'orc', x: 0, y: 0 }, ghost: { id: 'ghost', x: 0, y: 0, isHidden: true } };
  const harness = {
    store: { getState: () => ({ objects: { tokens }, isPlayerView: playersView, isGMView: !playersView }) },
    playerSight: { perception: () => undefined, hides: (id: string) => unseen.includes(id) },
    isInPlayerMode: () => playersView,
    hidesToken: Reflect.get(TokenRenderer.prototype, 'hidesToken') as unknown,
  };
  return TokenRenderer.prototype.showsToken.call(harness, tokenId);
}

describe('whether the canvas shows a token, for what may select it', () => {
  it('shows every token to the GM, hidden ones included', () => {
    expect([showsToken('orc', false), showsToken('ghost', false)]).toEqual([true, true]);
  });

  it('leaves out a hidden token in the players\' perspective, and one their sight leaves out', () => {
    expect(showsToken('ghost', true)).toBe(false);
    expect(showsToken('orc', true, ['orc'])).toBe(false);
    expect(showsToken('orc', true)).toBe(true);
  });

  it('shows no token that is gone', () => {
    expect(showsToken('gone', false)).toBe(false);
  });
});
