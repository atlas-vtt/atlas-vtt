import { afterEach, describe, expect, it, vi } from 'vitest';
import { gatedWorldMap, onWorldMapChange, setWorldMapGate, type WorldMapGate } from '../../../../src/app/online/gm/book/worldMapGate.ts';

/** A gate that answers `path` and counts who listens to it. */
function gateOf(path: string | null): WorldMapGate & { readonly listening: () => number; readonly change: () => void } {
  const listeners = new Set<() => void>();
  return {
    worldMap: () => Promise.resolve(path),
    onChange: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    listening: () => listeners.size,
    change: () => { for (const listener of [...listeners]) listener(); },
  };
}

afterEach(() => setWorldMapGate(null));

describe('the world map gate', () => {
  it('shows no image without a gate, and the gate\'s answer with one', async () => {
    expect(await gatedWorldMap()).toBeNull();
    setWorldMapGate(gateOf('atlas-vtt/assets/world.webp'));
    expect(await gatedWorldMap()).toBe('atlas-vtt/assets/world.webp');
  });

  it('tells its listeners when the gate says so or is replaced, and listens to the gate only while someone listens', () => {
    const first = gateOf('a');
    const second = gateOf('b');
    const heard = vi.fn();
    setWorldMapGate(first);
    const stop = onWorldMapChange(heard);
    expect(first.listening()).toBe(1);

    first.change();
    setWorldMapGate(second);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(first.listening()).toBe(0);
    expect(second.listening()).toBe(1);

    second.change();
    setWorldMapGate(null);
    expect(heard).toHaveBeenCalledTimes(4);
    expect(second.listening()).toBe(0);

    setWorldMapGate(first);
    stop();
    expect(first.listening()).toBe(0);
    first.change();
    expect(heard).toHaveBeenCalledTimes(5);
  });
});
