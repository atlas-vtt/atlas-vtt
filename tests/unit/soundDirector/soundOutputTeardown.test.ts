// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { SoundLifecycle } from '@/app/sound/engine/soundWatchdog';
import { SoundOutput } from '@/app/soundDirector/soundOutput';
import { EMPTY_TABLE_SOUND, enteringLayer } from '@/app/soundDirector/tableSound';
import { emptyBytes } from '../../helpers/soundPlayerRig';
import { FakeOutputContext } from '../../helpers/soundDirectorRig';

/** A context whose clock stands, which sends the watchdog through its recovery. */
class StoppedContext extends FakeOutputContext {
  override state = 'suspended';
  override resume(): Promise<void> { return Promise.resolve(); }
}

function rig(): { output: SoundOutput; contexts: StoppedContext[]; states: SoundLifecycle[]; flush: () => Promise<void> } {
  const contexts: StoppedContext[] = [];
  const states: SoundLifecycle[] = [];
  const waits: Array<() => void> = [];
  const output = new SoundOutput({
    createContext: () => {
      const context = new StoppedContext();
      contexts.push(context);
      return context;
    },
    tableNow: () => 0,
    resolve: () => Promise.resolve(emptyBytes),
    levels: () => ({ musicDb: 0, ambienceDb: 0, masterDb: 0 }),
    onSoundError: () => undefined,
    onLifecycle: (state) => states.push(state),
    wait: () => new Promise((resolve) => { waits.push(resolve); }),
  });
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) {
      waits.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    }
  };
  return { output, contexts, states, flush };
}

describe('a closed output', () => {
  it('stays closed through a recovery that was under way, and leaves no context behind', async () => {
    const { output, contexts, flush } = rig();
    output.ensureRunning();
    const check = output.check();
    await Promise.resolve();
    output.close();
    await flush();
    await check;
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.closed).toBe(true);
    expect(output.isOpen).toBe(false);
  });

  it('plays again on the next press, with a player of its own', async () => {
    const { output, contexts, flush } = rig();
    output.ensureRunning();
    const check = output.check();
    await Promise.resolve();
    output.close();
    await flush();
    await check;
    output.ensureRunning();
    expect(contexts).toHaveLength(2);
    output.setState({ ...EMPTY_TABLE_SOUND, layers: [enteringLayer({ key: 'rain', frames: 480_000, gainDb: 0 }, 0, 0, 1000)] });
    expect(output.waitingKeys()).toEqual(['rain']);
    output.close();
  });

  it('a recovery that nothing stops still rebuilds', async () => {
    const { output, contexts, flush } = rig();
    output.ensureRunning();
    const check = output.check();
    await flush();
    await check;
    expect(contexts.length).toBeGreaterThan(1);
    output.close();
    expect(contexts.every((context) => context.closed)).toBe(true);
  });
});
