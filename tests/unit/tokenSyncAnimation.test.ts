import { afterEach, describe, expect, it, vi } from 'vitest';
import { token, tokenSyncHarness } from '../mocks/tokenSyncHarness';

afterEach(() => vi.restoreAllMocks());

describe('token synchronization animations', () => {
  it('snaps to the current stored target without starting an animation', () => {
    const h = tokenSyncHarness({ hero: token(80, 30) });
    h.sync.animateTokenToPosition('hero', 80, 30);
    expect([h.sprite.x, h.sprite.y]).toEqual([80, 30]);
    expect(h.ui).toHaveBeenCalledExactlyOnceWith('hero', 80, 30);
    expect(h.sync.isTokenAnimating('hero')).toBe(false);
    expect(h.moved).not.toHaveBeenCalled();
    h.destroy();
  });

  it('cancels a normal animation when the current stored position conflicts', () => {
    const h = tokenSyncHarness({ hero: token() });
    h.sync.animateTokenToPosition('hero', 80, 30);
    h.replaceTokens({ hero: token(12, 18) });
    h.tick(20);
    expect([h.sprite.x, h.sprite.y]).toEqual([12, 18]);
    expect(h.sync.isTokenAnimating('hero')).toBe(false);
    expect(h.ticker.count).toBe(0);
    expect(h.ended).toHaveBeenCalledExactlyOnceWith('hero');
    expect(h.moved).not.toHaveBeenCalled();
    h.destroy();
  });

  it('finishes transient movement without changing stored position and reads current selection', () => {
    const h = tokenSyncHarness({ hero: token() });
    h.sync.initialize();
    h.events.emit('animate-token-to-position', { tokenId: 'hero', targetX: 80, targetY: 30, transient: true });
    h.tick(20);
    expect(h.controls).not.toHaveBeenCalled();
    h.store.setState({ selectedIds: ['hero'] });
    h.tick(60);
    expect([h.sprite.x, h.sprite.y]).toEqual([80, 30]);
    expect(h.controls).toHaveBeenLastCalledWith(80, 30, 70);
    expect(h.moved).not.toHaveBeenCalled();
    expect(h.store.getState().objects.tokens.hero?.x).toBe(0);
    expect(h.ticker.count).toBe(0);
    h.destroy();
  });

  it('commits normal animation completion through the movement action', () => {
    const h = tokenSyncHarness();
    h.sync.animateTokenToPosition('hero', 40, 20);
    h.tick(200);
    expect(h.moved).toHaveBeenCalledExactlyOnceWith('hero', 40, 20);
    expect(h.ticker.count).toBe(0);
    h.destroy();
  });

  it('uses the current movement action when an animation finishes', () => {
    const h = tokenSyncHarness();
    h.sync.animateTokenToPosition('hero', 40, 20);
    const replacement = vi.fn();
    h.store.setState({ moveToken: replacement });
    h.tick(200);
    expect(replacement).toHaveBeenCalledExactlyOnceWith('hero', 40, 20);
    expect(h.moved).not.toHaveBeenCalled();
    h.destroy();
  });

  it('plays a path, follows current selection and commits its final position', () => {
    const h = tokenSyncHarness({ hero: token() });
    h.sync.initialize();
    h.events.emit('animate-token-path', { tokenId: 'hero', finalX: 100, finalY: 20,
      path: [{ x: 25, y: 5, timestamp: 0 }, { x: 75, y: 15, timestamp: 200 }], duration: 400 });
    h.tick(80);
    expect(h.sprite.x).toBeGreaterThan(25);
    h.store.setState({ selectedIds: ['hero'] });
    h.tick(80);
    expect(h.controls).toHaveBeenLastCalledWith(h.sprite.x, h.sprite.y, 70);
    h.tick(80);
    h.tick(80);
    expect([h.sprite.x, h.sprite.y]).toEqual([100, 20]);
    expect(h.moved).toHaveBeenCalledExactlyOnceWith('hero', 100, 20);
    expect(h.ticker.count).toBe(0);
    h.destroy();
  });

  it('cancels active tickers when destroyed', () => {
    const h = tokenSyncHarness({ hero: token() });
    h.sync.animateTokenToPosition('hero', 80, 30, { transient: true });
    expect(h.ticker.count).toBe(1);
    h.sync.destroyAll();
    expect(h.ticker.count).toBe(0);
    expect(h.sprite.currentAnimation).toBeNull();
    expect(h.sync.isTokenAnimating('hero')).toBe(false);
    h.tick(100);
    expect(h.moved).not.toHaveBeenCalled();
    h.destroy();
  });
});
