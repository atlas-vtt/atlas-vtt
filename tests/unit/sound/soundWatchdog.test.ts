import { describe, expect, it } from 'vitest';
import { SoundWatchdog, type SoundLifecycle, type WatchedContext } from '@/app/sound/engine/soundWatchdog';

/** A context whose clock can stand while it reads `running`, as iOS can show. */
class FakeContext implements WatchedContext {
  time = 0;
  state = 'running';
  frozen = false;
  resumes = 0;
  suspends = 0;
  resumeNeverSettles = false;
  healsOnSuspend = false;

  advance(seconds: number): void {
    if (!this.frozen && this.state === 'running') this.time += seconds;
  }

  get currentTime(): number {
    return this.time;
  }

  suspend(): Promise<void> {
    this.suspends++;
    this.state = 'suspended';
    if (this.healsOnSuspend) this.frozen = false;
    return Promise.resolve();
  }

  resume(): Promise<void> {
    this.resumes++;
    if (this.resumeNeverSettles) return new Promise(() => undefined);
    this.state = 'running';
    return Promise.resolve();
  }
}

function harness(first: FakeContext, nextContext?: () => FakeContext): { dog: SoundWatchdog; states: SoundLifecycle[]; waited: () => number; rebuilds: () => number; current: () => FakeContext } {
  let current = first;
  let waited = 0;
  let rebuilds = 0;
  const states: SoundLifecycle[] = [];
  const dog = new SoundWatchdog({
    context: () => current,
    rebuild: () => {
      rebuilds++;
      if (!nextContext) throw new Error('cannot rebuild');
      current = nextContext();
    },
    wait: (ms) => {
      waited += ms;
      current.advance(ms / 1000);
      return Promise.resolve();
    },
    onChange: (state) => states.push(state),
  });
  return { dog, states, waited: () => waited, rebuilds: () => rebuilds, current: () => current };
}

describe('the watchdog', () => {
  it('goes from off through joining to playing once the clock moves', async () => {
    const context = new FakeContext();
    const { dog, states } = harness(context);
    expect(dog.state).toBe('off');
    dog.start();
    expect(dog.state).toBe('joining');
    await dog.check();
    context.advance(1);
    await dog.check();
    expect(states).toEqual(['joining', 'playing']);
    dog.stop();
    expect(dog.state).toBe('off');
  });

  it('checks nothing while off', async () => {
    const context = new FakeContext();
    context.frozen = true;
    const { dog, rebuilds } = harness(context);
    await dog.check();
    await dog.check();
    expect(context.suspends).toBe(0);
    expect(rebuilds()).toBe(0);
  });

  it('cures a frozen clock with suspend and resume within two checks', async () => {
    const context = new FakeContext();
    const { dog, states, rebuilds } = harness(context);
    dog.start();
    await dog.check();
    context.advance(1);
    await dog.check();
    context.frozen = true;
    context.healsOnSuspend = true;
    await dog.check();
    expect(context.suspends).toBe(1);
    expect(context.resumes).toBe(1);
    expect(rebuilds()).toBe(0);
    expect(dog.state).toBe('playing');
    expect(states).toEqual(['joining', 'playing']);
  });

  it('rebuilds when suspend and resume do not help', async () => {
    const context = new FakeContext();
    context.frozen = true;
    const { dog, rebuilds, current } = harness(context, () => new FakeContext());
    dog.start();
    await dog.check();
    await dog.check();
    expect(rebuilds()).toBe(1);
    expect(current()).not.toBe(context);
    expect(dog.state).toBe('playing');
  });

  it('asks for a tap when even a new context stands, and comes back by itself', async () => {
    const frozen = (): FakeContext => {
      const context = new FakeContext();
      context.frozen = true;
      return context;
    };
    const { dog, states, current } = harness(frozen(), frozen);
    dog.start();
    await dog.check();
    await dog.check();
    expect(dog.state).toBe('needs-tap');
    current().frozen = false;
    await dog.check();
    current().advance(1);
    await dog.check();
    expect(dog.state).toBe('playing');
    expect(states).toEqual(['joining', 'needs-tap', 'playing']);
  });

  it('builds no more contexts while the chip is up, until a tap starts over', async () => {
    const frozen = (): FakeContext => {
      const context = new FakeContext();
      context.frozen = true;
      return context;
    };
    const { dog, rebuilds } = harness(frozen(), frozen);
    dog.start();
    await dog.check();
    await dog.check();
    expect(rebuilds()).toBe(1);
    await dog.check();
    await dog.check();
    expect(rebuilds()).toBe(1);
    dog.start();
    expect(dog.state).toBe('joining');
    await dog.check();
    await dog.check();
    expect(rebuilds()).toBe(2);
  });

  it('does not hang on a resume that never settles', async () => {
    const context = new FakeContext();
    context.state = 'suspended';
    context.resumeNeverSettles = true;
    const { dog } = harness(context);
    dog.start();
    await dog.check();
    expect(dog.state).toBe('needs-tap');
  });

  it('asks for a tap at once where the rebuild itself fails', async () => {
    const context = new FakeContext();
    context.frozen = true;
    const { dog } = harness(context);
    dog.start();
    await dog.check();
    await dog.check();
    expect(dog.state).toBe('needs-tap');
  });

  it('runs one recovery at a time', async () => {
    const context = new FakeContext();
    context.frozen = true;
    const { dog } = harness(context);
    dog.start();
    await dog.check();
    await Promise.all([dog.check(), dog.check()]);
    expect(context.suspends).toBe(1);
  });

  it('a stop during a recovery ends it: nothing is rebuilt, and it stays off', async () => {
    const first = new FakeContext();
    const contexts: FakeContext[] = [];
    let rebuilds = 0;
    const states: SoundLifecycle[] = [];
    const waits: Array<() => void> = [];
    const dog = new SoundWatchdog({
      context: () => first,
      rebuild: () => {
        rebuilds++;
        contexts.push(new FakeContext());
      },
      wait: () => new Promise((resolve) => { waits.push(resolve); }),
      onChange: (state) => states.push(state),
    });
    dog.start();
    first.frozen = true;
    first.state = 'suspended';
    const check = dog.check();
    await Promise.resolve();
    dog.stop();
    for (let i = 0; i < 20; i++) {
      waits.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    }
    await check;
    expect(rebuilds).toBe(0);
    expect(dog.state).toBe('off');
    expect(states.at(-1)).toBe('off');
  });
});
