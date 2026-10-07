import { describe, expect, it, vi } from 'vitest';
import { API_EVENTS, ApiEvents } from '../../src/api/events';

describe('ApiEvents', () => {
  it('keeps one registration when another extension registers the same function', () => {
    const events = new ApiEvents();
    const shared = vi.fn();
    const disposeA = events.on('unload', shared);
    events.on('unload', shared);
    disposeA();
    events.emit('unload');
    expect(shared).toHaveBeenCalledTimes(1);
  });

  it('treats the same function registered twice as two registrations', () => {
    const events = new ApiEvents();
    const listener = vi.fn();
    const first = events.on('unload', listener);
    events.on('unload', listener);
    expect(events.size).toBe(2);
    first();
    first();
    expect(events.size).toBe(1);
    events.emit('unload');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a throwing listener does not stop the others', () => {
    const events = new ApiEvents();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const after = vi.fn();
    events.on('unload', () => { throw new Error('boom'); });
    events.on('unload', after);
    events.emit('unload');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('C-tabs-1: lists tabs-changed, so an extension can hear it', () => {
    expect(API_EVENTS).toContain('tabs-changed');
    const events = new ApiEvents();
    const listener = vi.fn();
    events.on('tabs-changed', listener);
    const view = { viewId: 'v1', kind: 'map', activeTabId: null, tabs: [], mapPath: null, loaded: false } as const;
    events.emit('tabs-changed', view);
    expect(listener).toHaveBeenCalledWith(view);
  });
});
