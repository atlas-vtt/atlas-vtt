import { describe, expect, it, vi } from 'vitest';
import { fogRect, fogScenes } from '../helpers/fogCoverageScene';
import { migrateMapFile } from '../../src/app/services/MapPersistence';
import { FogOperationCanvas } from '../../src/app/pixi/fog/FogOperationCanvas';

const { scene } = fogScenes();

describe('fog renderer lifecycle', () => {
  it('shows preloaded fog and preserves GM opacity across player captures', async () => {
    const s = await scene({ paint: fogRect() });
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(32, 32, false)).toBeCloseTo(128, -1);
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(100, 100)).toBe(255);
  });

  it('follows append, undo, redo and clear through the actual store history', async () => {
    const s = await scene({ paint: fogRect() });
    s.setFog({ ...s.store.getState().objects.fog, erase: { ...fogRect('erase', 2, true), x: 32, y: 32, width: 16, height: 16 } });
    expect(s.read(40, 40)).toBe(255);
    s.store.temporal.getState().undo();
    expect(s.read(40, 40)).toBe(0);
    s.store.temporal.getState().redo();
    expect(s.read(40, 40)).toBe(255);
    s.setFog({});
    expect(s.read(24, 24)).toBe(255);
  });

  it('moves committed fog by its saved offset', async () => {
    const s = await scene({ paint: fogRect() });
    s.setFog({ paint: { ...fogRect(), offsetX: 32 } });
    expect(s.read(24, 32)).toBe(255);
    expect(s.read(96, 32)).toBe(0);
  });

  it('restores each map after A to B to A changes without a loading transition', async () => {
    const a = { paint: fogRect() };
    const s = await scene(a);
    s.store.setState(state => ({ mapPath: 'maps/b.atlasmap', objects: { ...state.objects, fog: {} } }));
    expect(s.read(32, 32)).toBe(255);
    s.store.setState(state => ({ mapPath: 'maps/a.atlasmap', objects: { ...state.objects, fog: a } }));
    expect(s.read(32, 32)).toBe(0);
  });

  it('redraws after bounds changes without changing saved fog', async () => {
    const s = await scene({ paint: fogRect() });
    const fog = s.store.getState().objects.fog;
    s.events.emit('background-sprite-updated', { x: -32, y: -32, width: 256, height: 256 });
    expect(s.store.getState().objects.fog).toBe(fog);
    expect(s.read(32, 32)).toBe(0);
    s.store.setState({ isGMView: false });
    expect(s.read(32, 32, false)).toBe(0);
  });

  it('discards a live erase when the tool changes and keeps saved fog', async () => {
    const s = await scene({ paint: fogRect() });
    s.store.getState().setActiveTool('eraser');
    s.events.emit('fog-brush-size-changed', 16);
    s.pointer('pointerdown', 32, 32);
    s.pointer('pointermove', 64, 32);
    expect(s.read(48, 32)).toBe(255);
    s.store.getState().setActiveTool('select');
    expect(s.read(48, 32)).toBe(0);
    expect(Object.keys(s.store.getState().objects.fog)).toEqual(['paint']);
  });

  it('commits a brush through public pointer events', async () => {
    const s = await scene();
    s.store.getState().setActiveTool('fog');
    s.events.emit('fog-brush-size-changed', 16);
    s.pointer('pointerdown', 32, 32);
    s.pointer('pointermove', 64, 32);
    s.pointer('pointerup', 64, 32);
    expect(Object.values(s.store.getState().objects.fog)).toHaveLength(1);
    expect(s.read(48, 32)).toBe(0);
    s.store.getState().setActiveTool('select');
    expect(s.read(48, 32)).toBe(0);
  });

  it('shows saved edits skipped during a lasso when changing the drawing mode', async () => {
    const s = await scene({ paint: fogRect() });
    s.store.getState().setActiveTool('fog');
    s.events.emit('fog-mode-changed', 'lasso');
    s.pointer('pointerdown', 96, 96);
    s.pointer('pointermove', 112, 112);
    s.setFog({});
    s.events.emit('fog-mode-changed', 'rectangle');
    expect(s.read(32, 32)).toBe(255);
    expect(Object.keys(s.store.getState().objects.fog)).toEqual([]);
  });

  it('shows the completed map after loading and does not retain the previous map coverage', async () => {
    const s = await scene({ paint: fogRect() });
    s.store.setState({ isMapLoading: true, mapPath: 'maps/b.atlasmap' });
    expect(s.fog.getContainer().visible).toBe(false);
    s.setFog({ paint: { ...fogRect(), offsetX: 32 } });
    s.store.setState({ isMapLoading: false });
    expect(s.read(24, 32)).toBe(255);
    expect(s.read(96, 32)).toBe(0);
  });

  it('keeps invalid saved geometry opaque without building editing proxies', async () => {
    const s = await scene();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const proxy = vi.spyOn(FogOperationCanvas.prototype, 'getCanvas');
    s.setFog({ paint: { ...fogRect(), timestamp: Number.NaN } });
    expect(s.read(100, 100)).toBe(0);
    expect(s.read(32, 32)).toBe(0);
    expect(proxy).not.toHaveBeenCalled();
    proxy.mockRestore();
    s.setFog({ paint: fogRect() });
    expect(s.read(100, 100)).toBe(255);
    expect(s.read(32, 32)).toBe(0);
  });

  it('draws valid saved fog even when its editing proxy fails', async () => {
    const s = await scene();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const proxy = vi.spyOn(FogOperationCanvas.prototype, 'getCanvas').mockImplementationOnce(() => { throw new Error('Proxy failed'); });
    s.setFog({ paint: fogRect() });
    expect(proxy).toHaveBeenCalledTimes(1);
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(100, 100)).toBe(255);
  });

  it.each([false, true])('covers malformed saved points during bounds calculation (preloaded: %s)', async preloaded => {
    const saved = migrateMapFile({ objects: { fog: { broken: {
      kind: 'fog', id: 'broken', type: 'lasso', timestamp: 1,
      isErasing: false, points: [null, { x: 64, y: 32 }, { x: 32, y: 64 }],
    } } } }).objects.fog;
    expect(Object.keys(saved)).toEqual(['broken']);
    const s = await scene(preloaded ? saved : {});
    if (!preloaded) s.setFog(saved);
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(100, 100)).toBe(0);
    s.setFog({ paint: fogRect() });
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(100, 100)).toBe(255);
  });


  it.each(['mode', 'tool', 'release', 'erase'])('updates bounds for saved edits after canceling a stroke by %s', async cancel => {
    const s = await scene({ paint: fogRect() });
    s.store.getState().setActiveTool('fog');
    s.events.emit('fog-mode-changed', 'lasso');
    s.pointer('pointerdown', 96, 96);
    s.setFog({ paint: { ...fogRect(), offsetX: 1000, offsetY: 1000, width: 256, height: 256 } });
    if (cancel === 'mode') s.events.emit('fog-mode-changed', 'rectangle');
    else if (cancel === 'tool') s.store.getState().setActiveTool('select');
    else if (cancel === 'erase') s.store.getState().setActiveTool('eraser');
    else s.pointer('pointerup', 96, 96);
    s.lookAt(1000, 1000);
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(8, 8)).toBe(255);
  });

});
