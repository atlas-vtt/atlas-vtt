import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createSceneSource } from '../../src/app/plugin/host/sceneSource';

describe('selected scene state', () => {
  it('reads current state without notifying when a subscription starts', () => {
    const store = createStore(() => ({ tool: 'move', count: 0 }));
    const source = createSceneSource(store, state => state.tool);
    const changed = vi.fn();
    const stop = source.subscribe(changed);
    expect(source.get()).toBe('move');
    expect(changed).not.toHaveBeenCalled();
    store.setState({ tool: 'laser-pointer' });
    expect(source.get()).toBe('laser-pointer');
    expect(changed).toHaveBeenCalledExactlyOnceWith('laser-pointer', 'move');
    stop();
  });

  it('ignores unrelated and equal values and releases each listener separately', () => {
    const store = createStore(() => ({ tool: 'move', count: 0 }));
    const source = createSceneSource(store, state => state.tool);
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = source.subscribe(first);
    store.setState({ count: 1 });
    store.setState({ tool: 'move' });
    expect(first).not.toHaveBeenCalled();
    store.setState({ tool: 'laser-pointer' });
    const stopSecond = source.subscribe(second);
    stopFirst();
    store.setState({ tool: 'select' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledExactlyOnceWith('select', 'laser-pointer');
    stopSecond();
    store.setState({ tool: 'move' });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('updates the previous selection before a listener triggers another change', () => {
    const store = createStore(() => ({ value: 0 }));
    const source = createSceneSource(store, state => state.value);
    const changes: [number, number][] = [];
    const stop = source.subscribe((next, previous) => {
      changes.push([next, previous]);
      if (next === 1) store.setState({ value: 2 });
    });
    store.setState({ value: 1 });
    expect(changes).toEqual([[1, 0], [2, 1]]);
    stop();
  });

  it('uses Object.is equality for selected values', () => {
    const store = createStore(() => ({ value: NaN }));
    const source = createSceneSource(store, state => state.value);
    const changed = vi.fn();
    const stop = source.subscribe(changed);
    store.setState({ value: NaN });
    expect(changed).not.toHaveBeenCalled();
    store.setState({ value: 0 });
    store.setState({ value: -0 });
    expect(changed.mock.calls).toEqual([[0, NaN], [-0, 0]]);
    stop();
  });
});
