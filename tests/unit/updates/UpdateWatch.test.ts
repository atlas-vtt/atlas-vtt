import { describe, expect, it, vi } from 'vitest';
import { UpdateWatch, type UpdateWatchDeps } from '../../../src/app/updates/UpdateWatch';

/** What a device keeps between starts of Atlas: the version the GM last acted on. */
interface Device { stored: string | null }

function watchWith(published: Array<string | null>, overrides: Partial<UpdateWatchDeps> = {}, device: Device = { stored: null }): { watch: UpdateWatch; announce: ReturnType<typeof vi.fn>; readPublished: ReturnType<typeof vi.fn> } {
  const queue = [...published];
  const readPublished = vi.fn(async () => queue.shift() ?? null);
  const announce = vi.fn();
  const watch = new UpdateWatch({
    installed: '0.8.0',
    readPublished,
    enabled: () => true,
    online: () => true,
    announced: { get: () => device.stored, set: (version) => { device.stored = version; } },
    announce,
    ...overrides,
  });
  return { watch, announce, readPublished };
}

describe('UpdateWatch', () => {
  it('announces a newer release once while Atlas runs', async () => {
    const { watch, announce } = watchWith(['0.9.0', '0.9.0']);
    await watch.check();
    await watch.check();
    expect(announce).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith('0.9.0', expect.any(Function));
    expect(watch.available()).toBe('0.9.0');
  });

  it('announces again for the next release', async () => {
    const { watch, announce } = watchWith(['0.9.0', '0.9.1']);
    await watch.check();
    await watch.check();
    expect(announce.mock.calls.map(([version]) => version)).toEqual(['0.9.0', '0.9.1']);
  });

  it('announces again at the next start until the GM acts on the notice, and then no more', async () => {
    const device: Device = { stored: null };
    // Shown, but nobody looked: the next start shows it again
    const first = watchWith(['0.9.1'], {}, device);
    await first.watch.check();
    expect(first.announce).toHaveBeenCalledOnce();
    const second = watchWith(['0.9.1'], {}, device);
    await second.watch.check();
    expect(second.announce).toHaveBeenCalledOnce();
    // Update, What's new or the close button: that version is never shown again
    (second.announce.mock.calls[0]![1] as () => void)();
    const third = watchWith(['0.9.1'], {}, device);
    await third.watch.check();
    expect(third.announce).not.toHaveBeenCalled();
    expect(third.watch.available()).toBe('0.9.1');
  });

  it('stays silent while switched off or offline, unless asked', async () => {
    for (const overrides of [{ enabled: () => false }, { online: () => false }]) {
      const { watch, readPublished } = watchWith(['0.9.0'], overrides);
      await watch.check();
      expect(readPublished).not.toHaveBeenCalled();
      await watch.check({ force: true });
      expect(watch.available()).toBe('0.9.0');
    }
  });

  it('keeps what it knew when a look fails', async () => {
    const { watch } = watchWith(['0.9.0', null]);
    await watch.check();
    await watch.check();
    expect(watch.available()).toBe('0.9.0');
  });

  it('looks once while a look is under way', async () => {
    const { watch, readPublished } = watchWith(['0.9.0']);
    await Promise.all([watch.check(), watch.check({ force: true })]);
    expect(readPublished).toHaveBeenCalledOnce();
  });

  it('announces nothing for an equal or older release', async () => {
    const { watch, announce } = watchWith(['0.8.0', '0.7.9']);
    await watch.check();
    await watch.check();
    expect(announce).not.toHaveBeenCalled();
    expect(watch.available()).toBeNull();
  });

  it('tells listeners when a look starts and ends', async () => {
    const { watch } = watchWith(['0.9.0']);
    const seen: Array<[boolean, string | null]> = [];
    watch.onChange(() => seen.push([watch.isChecking(), watch.available()]));
    await watch.check();
    expect(seen).toEqual([[true, null], [false, '0.9.0']]);
  });
});
