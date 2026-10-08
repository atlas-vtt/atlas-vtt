import { Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { PlayerSightTokens } from '../../src/app/pixi/token-renderer/PlayerSightTokens';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { TokenEntity } from '../../src/app/types';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

/**
 * A remote view is a player view, so #303 hides every token whose centre is under its committed fog, and an
 * extension that feeds a lit scene's darkness as a fog operation has that darkness count as fog: a token whose
 * centre lies in a dark cell is left out whole, also while the player drags it, where before #303 the opaque fog only
 * covered the part of it under the dark. This pins that: it hides more, never less.
 */

const token = (id: string, x: number, y: number): TokenEntity => ({ id, kind: 'token', imagePath: 'token.png', x, y });

function sprite(entity: TokenEntity): TokenGroupContainer {
  const group = Object.assign(new Container(), { tokenId: entity.id, tokenData: entity, tokenSize: 70, artPath: entity.imagePath, strokeWidth: 0 });
  group.position.set(entity.x, entity.y);
  return group;
}

/** The darkness over the right half of a 1000 × 800 map, as one paint lasso after every GM operation. */
const darkness: FogOperation = {
  id: 'atlas-lighting-darkness', kind: 'fog', type: 'lasso', timestamp: Number.MAX_SAFE_INTEGER, isErasing: false,
  points: [{ x: 500, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }, { x: 500, y: 800 }],
};

let restore: () => void;
beforeEach(() => { restore = stubJsdomGraphics(); });
afterEach(() => { restore(); });

describe("a remote view's fed darkness and the tokens under it", () => {
  it('hides a token whose centre is dark, even one the player holds, and keeps the rest', () => {
    const tokens = { lit: token('lit', 300, 400), edge: token('edge', 510, 400), held: token('held', 700, 400) };
    const sprites = Object.fromEntries(Object.values(tokens).map((entity) => [entity.id, sprite(entity)]));
    const sight = new PlayerSightTokens({ tokens: () => tokens, sprites: () => sprites, held: () => new Set(['held']) });
    sight.setFogProvider(() => fogCoverage({ [darkness.id]: darkness }), () => true);
    expect(sight.hides('lit')).toBe(false);
    expect(sight.hides('edge')).toBe(true);
    expect(sight.hides('held')).toBe(true);
    sight.destroy();
  });
});
