import { afterEach, describe, expect, it, vi } from 'vitest';
import { token, tokenSyncHarness } from '../mocks/tokenSyncHarness';

afterEach(() => vi.restoreAllMocks());

describe('token synchronization state', () => {
  it('skips empty initial state and immediately draws existing tokens even while loading', () => {
    const empty = tokenSyncHarness();
    empty.sync.initialize();
    expect(empty.changed).not.toHaveBeenCalled();
    empty.destroy();
    const h = tokenSyncHarness({ hero: token() });
    h.store.setState({ isMapLoading: true });
    h.sync.initialize();
    expect(h.changed).toHaveBeenCalledExactlyOnceWith(h.store.getState().objects.tokens, {});
    h.destroy();
  });

  it('ignores selection and loading-only updates and supplies exact token snapshots', () => {
    const h = tokenSyncHarness({ hero: token() });
    h.sync.initialize();
    h.changed.mockClear();
    h.store.setState({ selectedIds: ['hero'], isMapLoading: true });
    h.store.setState({ isMapLoading: false });
    expect(h.changed).not.toHaveBeenCalled();
    const previous = h.store.getState().objects.tokens;
    h.replaceTokens({ hero: token(40, 20) });
    expect(h.changed).toHaveBeenCalledExactlyOnceWith(h.store.getState().objects.tokens, previous);
    h.destroy();
  });

  it('holds the latest loading update until forced, then reads a fresh snapshot', () => {
    const h = tokenSyncHarness();
    h.sync.initialize();
    h.store.setState({ isMapLoading: true });
    h.replaceTokens({ hero: token(10) });
    const previous = h.store.getState().objects.tokens;
    h.replaceTokens({ hero: token(20) });
    const latest = h.store.getState().objects.tokens;
    expect(h.changed).not.toHaveBeenCalled();
    h.sync.forceSyncTokens();
    expect(h.changed).toHaveBeenCalledExactlyOnceWith(latest, previous);
    h.changed.mockClear();
    h.store.setState({ isMapLoading: false });
    expect(h.changed).not.toHaveBeenCalled();
    h.sync.forceSyncTokens();
    expect(h.changed).toHaveBeenCalledExactlyOnceWith(latest, {});
    h.destroy();
  });

  it('applies the held update when the load ends unforced, so a scene that failed to open keeps no tokens of the one before', () => {
    const h = tokenSyncHarness({ hero: token() });
    h.sync.initialize();
    h.changed.mockClear();
    const previous = h.store.getState().objects.tokens;
    h.store.setState({ isMapLoading: true });
    h.replaceTokens({});
    expect(h.changed).not.toHaveBeenCalled();
    h.store.setState({ isMapLoading: false });
    expect(h.changed).toHaveBeenCalledExactlyOnceWith({}, previous);
    h.destroy();
  });

  it('removes its subscriptions and leaves unrelated event listeners intact', () => {
    const h = tokenSyncHarness();
    const external = vi.fn();
    h.events.on('animate-token-path', external);
    h.sync.initialize();
    expect(h.events.listenerCount('animate-token-to-position')).toBe(1);
    expect(h.events.listenerCount('animate-token-path')).toBe(2);
    h.sync.destroyAll();
    h.replaceTokens({ hero: token() });
    expect(h.changed).not.toHaveBeenCalled();
    expect(h.events.listenerCount('animate-token-to-position')).toBe(0);
    expect(h.events.listeners('animate-token-path')).toEqual([external]);
    h.destroy();
  });
});
