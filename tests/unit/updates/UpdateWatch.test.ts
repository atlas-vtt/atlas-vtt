import { describe, expect, it, vi } from 'vitest';
import { MAX_HOLD_MS, UpdateWatch, type UpdateWatchDeps } from '../../../src/app/updates/UpdateWatch';

/** What a device keeps between starts of Atlas: the version the GM last acted on, and since when a notice has waited. */
interface Device { stored: string | null; heldSince?: number | null }

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
    inUse: () => false,
    heldSince: { get: () => device.heldSince ?? null, set: (at) => { device.heldSince = at; } },
    now: () => 0,
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

  describe('while Atlas is in use', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const acted = (announce: ReturnType<typeof vi.fn>): void => { (announce.mock.calls[0]![1] as () => void)(); };

    it('holds the notice and shows it at the next quiet moment, without looking again', async () => {
      let inUse = true;
      const { watch, announce, readPublished } = watchWith(['0.9.0'], { inUse: () => inUse });
      await watch.check();
      expect(announce).not.toHaveBeenCalled();
      expect(watch.available()).toBe('0.9.0');
      watch.quietMoment();
      expect(announce).not.toHaveBeenCalled();
      inUse = false;
      watch.quietMoment();
      expect(announce).toHaveBeenCalledWith('0.9.0', expect.any(Function));
      watch.quietMoment();
      expect(announce).toHaveBeenCalledOnce();
      expect(readPublished).toHaveBeenCalledOnce();
    });

    it('shows nothing at a quiet moment when no notice waits', async () => {
      const { watch, announce } = watchWith(['0.8.0'], { inUse: () => false });
      watch.quietMoment();
      await watch.check();
      watch.quietMoment();
      expect(announce).not.toHaveBeenCalled();
    });

    it('records the version only when the GM acts on the held notice', async () => {
      const device: Device = { stored: null };
      let inUse = true;
      const { watch, announce } = watchWith(['0.9.0'], { inUse: () => inUse }, device);
      await watch.check();
      inUse = false;
      watch.quietMoment();
      expect(device.stored).toBeNull();
      expect(device.heldSince).toBe(0);
      acted(announce);
      expect(device.stored).toBe('0.9.0');
      expect(device.heldSince).toBeNull();
    });

    it('shows a notice that waited at the next look or start that finds Atlas quiet', async () => {
      const device: Device = { stored: null };
      let inUse = true;
      const first = watchWith(['0.9.0', null], { inUse: () => inUse }, device);
      await first.watch.check();
      inUse = false;
      // The table ended without a quiet moment being heard; even a failed look shows what it knew
      await first.watch.check();
      expect(first.announce).toHaveBeenCalledOnce();
      const second = watchWith(['0.9.0'], { inUse: () => false }, device);
      await second.watch.check();
      expect(second.announce).toHaveBeenCalledOnce();
    });

    it('stays silent at a quiet moment once the GM switched the look off', async () => {
      let enabled = true;
      let inUse = true;
      const { watch, announce } = watchWith(['0.9.0'], { enabled: () => enabled, inUse: () => inUse });
      await watch.check();
      enabled = false;
      inUse = false;
      watch.quietMoment();
      expect(announce).not.toHaveBeenCalled();
    });

    it('shows anyway once a notice was held for the bound, across starts, whatever came out since', async () => {
      expect(MAX_HOLD_MS).toBe(7 * DAY_MS);
      const device: Device = { stored: null };
      const start = async (published: string, now: number): Promise<ReturnType<typeof vi.fn>> => {
        const { watch, announce } = watchWith([published], { inUse: () => true, now: () => now }, device);
        await watch.check();
        return announce;
      };
      expect(await start('0.9.0', 100)).not.toHaveBeenCalled();
      expect(device.heldSince).toBe(100);
      // A newer release keeps the clock running, or weekly releases would hold it for good
      expect(await start('0.9.1', 100 + 3 * DAY_MS)).not.toHaveBeenCalled();
      expect(device.heldSince).toBe(100);
      expect(await start('0.9.1', 100 + MAX_HOLD_MS - 1)).not.toHaveBeenCalled();
      expect(await start('0.9.1', 100 + MAX_HOLD_MS)).toHaveBeenCalledOnce();
      // Until the GM acts on it, as any notice: the next start shows it again
      const again = await start('0.9.1', 100 + MAX_HOLD_MS + DAY_MS);
      expect(again).toHaveBeenCalledOnce();
      acted(again);
      expect(device.heldSince).toBeNull();
      // The next release waits a whole bound of its own
      expect(await start('0.9.2', 100 + MAX_HOLD_MS + 2 * DAY_MS)).not.toHaveBeenCalled();
      expect(device.heldSince).toBe(100 + MAX_HOLD_MS + 2 * DAY_MS);
    });

    it('reaches the bound in a run of Atlas that never stops', async () => {
      let now = 0;
      const { watch, announce } = watchWith(['0.9.0', '0.9.0'], { inUse: () => true, now: () => now });
      await watch.check();
      now = MAX_HOLD_MS;
      await watch.check();
      expect(announce).toHaveBeenCalledOnce();
    });

    it('forgets the wait once nothing is due any more', async () => {
      const device: Device = { stored: null, heldSince: 5 };
      const { watch } = watchWith(['0.8.0'], { inUse: () => true }, device);
      await watch.check();
      expect(device.heldSince).toBeNull();
    });

    it('starts the wait anew when the stored time lies ahead of the clock', async () => {
      const device: Device = { stored: null, heldSince: 9 * DAY_MS };
      const { watch } = watchWith(['0.9.0'], { inUse: () => true, now: () => DAY_MS }, device);
      await watch.check();
      expect(device.heldSince).toBe(DAY_MS);
    });
  });
});
