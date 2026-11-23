import { EventEmitter as NodeEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../src/app/utils/typedEmitter';

/** What the scenarios ask of an emitter; Atlas' own and Node's both answer it. */
interface Emitter {
  on<Args extends unknown[]>(event: string, listener: (...args: Args) => void): unknown;
  once<Args extends unknown[]>(event: string, listener: (...args: Args) => void): unknown;
  off<Args extends unknown[]>(event: string, listener: (...args: Args) => void): unknown;
  emit(event: string, ...args: unknown[]): boolean;
  removeAllListeners(): unknown;
  listenerCount(event: string): number;
}

type Scenario = (emitter: Emitter, log: (entry: string) => void) => void;

/** What listeners saw, in the order they were called, for a scenario run on either emitter. */
function calls(emitter: Emitter, scenario: Scenario): string[] {
  const seen: string[] = [];
  scenario(emitter, entry => seen.push(entry));
  return seen;
}

/** Scenarios whose outcome callers rely on; each must end as it does on Node's emitter. */
const SCENARIOS: Record<string, Scenario> = {
  'calls listeners in the order they were added, with the arguments': (emitter, log) => {
    emitter.on('move', (x: number, y: number) => log(`a ${x},${y}`));
    emitter.on('move', (x: number) => log(`b ${x}`));
    emitter.on('other', () => log('other'));
    log(String(emitter.emit('move', 1, 2)));
    log(String(emitter.emit('nobody')));
  },
  'lets a listener remove itself and still calls the ones after it': (emitter, log) => {
    const first = (): void => {
      log('first');
      emitter.off('tick', first);
    };
    emitter.on('tick', first);
    emitter.on('tick', () => log('second'));
    emitter.emit('tick');
    emitter.emit('tick');
  },
  'still calls a listener that an earlier one removed during the emit': (emitter, log) => {
    const late = (): void => log('late');
    emitter.on('tick', () => {
      log('early');
      emitter.off('tick', late);
    });
    emitter.on('tick', late);
    emitter.emit('tick');
    emitter.emit('tick');
  },
  'leaves a listener added during an emit for the next one': (emitter, log) => {
    emitter.once('tick', () => {
      log('adder');
      emitter.on('tick', () => log('added'));
    });
    emitter.emit('tick');
    emitter.emit('tick');
  },
  'calls a once listener once, also when its event is emitted from a listener': (emitter, log) => {
    let nested = false;
    emitter.on('tick', () => {
      log('outer');
      if (nested) return;
      nested = true;
      emitter.emit('tick');
    });
    emitter.once('tick', () => log('once'));
    emitter.emit('tick');
    emitter.emit('tick');
  },
  'removes a once listener by the function it was given': (emitter, log) => {
    const listener = (): void => log('once');
    emitter.once('tick', listener);
    emitter.off('tick', listener);
    log(String(emitter.emit('tick')));
  },
  'removes one registration per off, the last added first': (emitter, log) => {
    const twice = (): void => log('twice');
    emitter.on('tick', twice);
    emitter.on('tick', () => log('between'));
    emitter.on('tick', twice);
    emitter.off('tick', twice);
    emitter.emit('tick');
    log(String(emitter.listenerCount('tick')));
    emitter.off('tick', () => log('never added'));
    log(String(emitter.listenerCount('tick')));
  },
  'removes every listener': (emitter, log) => {
    emitter.on('a', () => log('a'));
    emitter.once('b', () => log('b'));
    emitter.removeAllListeners();
    log(`${emitter.emit('a')} ${emitter.emit('b')} ${emitter.listenerCount('a')}`);
  },
  'ends an emit at a listener that throws': (emitter, log) => {
    emitter.on('tick', () => {
      throw new Error('broken');
    });
    emitter.on('tick', () => log('after'));
    try {
      emitter.emit('tick');
    } catch (error) {
      log(`threw ${(error as Error).message}`);
    }
  },
};

describe('EventEmitter', () => {
  it.each(Object.keys(SCENARIOS))('%s, as Node does', (name) => {
    const scenario = SCENARIOS[name]!;
    const own = calls(new EventEmitter(), scenario);
    expect(own.length).toBeGreaterThan(0);
    expect(own).toEqual(calls(new NodeEmitter(), scenario));
  });

  it('calls listeners in the order they were added, with the arguments', () => {
    expect(calls(new EventEmitter(), SCENARIOS['calls listeners in the order they were added, with the arguments']!))
      .toEqual(['a 1,2', 'b 1', 'true', 'false']);
  });

  it('calls a listener with the emitter as this and returns itself for chaining', () => {
    const emitter = new EventEmitter();
    const receiver = vi.fn(function (this: unknown): unknown {
      return this;
    });
    expect(emitter.on('tick', receiver).once('tick', receiver)).toBe(emitter);
    emitter.emit('tick');
    expect(receiver.mock.results.map(result => result.value)).toEqual([emitter, emitter]);
    expect(emitter.off('tick', receiver)).toBe(emitter);
    expect(emitter.listenerCount('tick')).toBe(0);
  });

  it('serves a subclass', () => {
    class Service extends EventEmitter {
      announce(): boolean {
        return this.emit('changed', 'value');
      }
    }
    const service = new Service();
    const heard = vi.fn();
    service.on('changed', heard);
    expect(service.announce()).toBe(true);
    expect(heard).toHaveBeenCalledExactlyOnceWith('value');
  });
});
