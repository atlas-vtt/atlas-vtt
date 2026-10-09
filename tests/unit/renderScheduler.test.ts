import { describe, expect, it, vi } from 'vitest';
import { RenderScheduler, hasPendingChanges, rendersOnChange, requestRender, setBeforeRender } from '../../src/app/pixi/RenderScheduler';
import { fakeApp, fakeGroup, type GroupState } from '../mocks/schedulerApp';

describe('hasPendingChanges', () => {
  it('is false for a render group without queued updates', () => {
    expect(hasPendingChanges(fakeGroup())).toBe(false);
  });

  it.each<[string, GroupState]>([
    ['a structure change', { structureDidChange: true }],
    ['an updated Graphics, Sprite or Text', { renderables: 1 }],
    ['a moved or restyled container', { updates: 1 }],
    ['a change inside a nested render group', { children: [fakeGroup({ updates: 2 })] }],
  ])('is true for %s', (_, state) => {
    expect(hasPendingChanges(fakeGroup(state))).toBe(true);
  });
});

describe('RenderScheduler', () => {
  it('replaces the per-tick render with a render only when the stage changed', () => {
    const group = fakeGroup();
    const { app, render, ticker } = fakeApp(group);
    const scheduler = new RenderScheduler(app);
    expect(rendersOnChange(app)).toBe(true);

    ticker.update(16);
    expect(render).toHaveBeenCalledTimes(1);
    ticker.update(32);
    ticker.update(48);
    expect(render).toHaveBeenCalledTimes(1);

    group.structureDidChange = true;
    ticker.update(64);
    expect(render).toHaveBeenCalledTimes(2);
    scheduler.destroy();
  });

  it('renders once on request for changes the scene graph cannot see', () => {
    const { app, render, ticker } = fakeApp(fakeGroup());
    const scheduler = new RenderScheduler(app);
    ticker.update(16);
    vi.mocked(render).mockClear();

    requestRender(app);
    ticker.update(32);
    ticker.update(48);

    expect(render).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });

  it('renders at once on renderNow, after the before-render hook, and not again on the next tick', () => {
    const { app, render, ticker } = fakeApp(fakeGroup());
    const scheduler = new RenderScheduler(app);
    ticker.update(16);
    vi.mocked(render).mockClear();
    const hook = vi.fn();
    setBeforeRender(app, hook);
    ticker.started = true;

    scheduler.renderNow();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(hook.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(render).mock.invocationCallOrder[0]!);

    ticker.update(32);
    expect(render).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });

  it('leaves renderNow to the next tick while the ticker is stopped', () => {
    const { app, render, ticker } = fakeApp(fakeGroup());
    const scheduler = new RenderScheduler(app);
    ticker.update(16);
    vi.mocked(render).mockClear();

    scheduler.renderNow();
    expect(render).not.toHaveBeenCalled();
    ticker.update(32);
    expect(render).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });

  it('stops rendering after destroy', () => {
    const group = fakeGroup({ structureDidChange: true });
    const { app, render, ticker } = fakeApp(group);
    new RenderScheduler(app).destroy();

    ticker.update(16);

    expect(render).not.toHaveBeenCalled();
    expect(rendersOnChange(app)).toBe(false);
  });
});

describe('before-render hook', () => {
  it('runs with the frame time right before each render, and never without one', () => {
    const events: string[] = [];
    const { app, ticker } = fakeApp(fakeGroup(), () => events.push('render'));
    const scheduler = new RenderScheduler(app);
    setBeforeRender(app, (frameTime) => events.push(`hook:${frameTime}`));

    ticker.update(16);
    ticker.update(32);
    requestRender(app);
    ticker.update(48);

    expect(events).toEqual(['hook:16', 'render', 'hook:48', 'render']);
    scheduler.destroy();
  });

  it('serves a render requested inside the hook with the render that follows', () => {
    const { app, render, ticker } = fakeApp(fakeGroup());
    const scheduler = new RenderScheduler(app);
    setBeforeRender(app, () => requestRender(app));

    ticker.update(16);
    ticker.update(32);
    ticker.update(48);

    expect(render).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });

  it('stops running once removed, and a removed hook never removes its successor', () => {
    const { app, ticker } = fakeApp(fakeGroup());
    const scheduler = new RenderScheduler(app);
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = setBeforeRender(app, first);
    const removeSecond = setBeforeRender(app, second);

    removeFirst();
    ticker.update(16);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    removeSecond();
    requestRender(app);
    ticker.update(32);
    expect(second).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });

  it('never keeps a frame from rendering when it throws, and reports the failure once', () => {
    const { app, render, ticker } = fakeApp(fakeGroup());
    const scheduler = new RenderScheduler(app);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setBeforeRender(app, () => { throw new Error('lost context'); });

    expect(() => ticker.update(16)).not.toThrow();
    requestRender(app);
    ticker.update(32);

    expect(render).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
    scheduler.destroy();
  });

  it('is dropped with the scheduler', () => {
    const { app, ticker } = fakeApp(fakeGroup());
    const hook = vi.fn();
    const scheduler = new RenderScheduler(app);
    setBeforeRender(app, hook);
    scheduler.destroy();

    ticker.update(16);

    expect(hook).not.toHaveBeenCalled();
  });
});
