// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TesseraEvent } from '../../../src/app/pixi/mosaicCanvas/tesseraProtocol';
import { MapProcessing, processingPercent, type ProcessingSource } from '../../../src/app/pixi/mosaicCanvas/mapProcessing';

/** The client's events, pushed by hand. */
class FakeSource implements ProcessingSource {
  private readonly listeners = new Set<(event: TesseraEvent) => void>();

  onEvent(listener: (event: TesseraEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: TesseraEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

const CRYPT = 'maps/Crypt.webp';
const progress = (done: number, path?: string, hash = 'a'): TesseraEvent => ({ type: 'progress', hash, done, total: 100, ...(path && { path }) });

describe('MapProcessing', () => {
  let source: FakeSource;
  let processing: MapProcessing;

  beforeEach(() => {
    source = new FakeSource();
    processing = new MapProcessing(source, { staleAfterMs: 1000 });
  });

  afterEach(() => {
    processing.dispose();
    vi.useRealTimers();
  });

  it('follows a build by the path its events name until it completes', () => {
    expect(processing.stateOf(CRYPT)).toBeNull();
    source.emit(progress(43, CRYPT));
    expect(processing.stateOf(CRYPT)).toEqual({ done: 43, total: 100 });
    expect(processing.busy()).toBe(true);
    source.emit({ type: 'complete', hash: 'a', path: CRYPT });
    expect(processing.stateOf(CRYPT)).toBeNull();
    expect(processing.busy()).toBe(false);
  });

  it('answers whenDone at once for a map not being processed, once its build ends otherwise, and never after an abort', async () => {
    await expect(processing.whenDone(CRYPT)).resolves.toBeUndefined();
    source.emit(progress(10, CRYPT));
    let done = false;
    const waited = processing.whenDone(CRYPT).then(() => { done = true; });
    source.emit(progress(50, CRYPT));
    await Promise.resolve();
    expect(done).toBe(false);
    source.emit({ type: 'complete', hash: 'a' });
    await waited;
    expect(done).toBe(true);

    source.emit(progress(10, CRYPT, 'b'));
    const asked = new AbortController();
    const aborted = processing.whenDone(CRYPT, asked.signal);
    asked.abort();
    await expect(aborted).rejects.toThrow('ended');
  });

  it('keeps builds of several maps apart', () => {
    source.emit(progress(10, 'maps/One.png', 'one'));
    source.emit(progress(70, 'maps/Two.png', 'two'));
    expect(processing.stateOf('maps/One.png')).toEqual({ done: 10, total: 100 });
    expect(processing.stateOf('maps/Two.png')).toEqual({ done: 70, total: 100 });
  });

  it('ends a build whose failure names no path by the path its progress named', () => {
    source.emit(progress(20, CRYPT));
    source.emit({ type: 'build-failed', hash: 'a', message: 'storage full' });
    expect(processing.stateOf(CRYPT)).toBeNull();
  });

  it('shows no sign for a build of a file it cannot name', () => {
    source.emit(progress(20));
    expect(processing.busy()).toBe(false);
  });

  it('drops a build that has sent no progress for a while', () => {
    vi.useFakeTimers();
    source.emit(progress(20, CRYPT));
    vi.advanceTimersByTime(900);
    source.emit(progress(30, CRYPT));
    vi.advanceTimersByTime(900);
    expect(processing.stateOf(CRYPT)).toEqual({ done: 30, total: 100 });
    vi.advanceTimersByTime(200);
    expect(processing.stateOf(CRYPT)).toBeNull();
  });

  it('tells its listeners of each change and stops listening once disposed', () => {
    const listener = vi.fn();
    processing.subscribe(listener);
    source.emit(progress(20, CRYPT));
    source.emit({ type: 'complete', hash: 'a', path: CRYPT });
    expect(listener).toHaveBeenCalledTimes(2);
    processing.dispose();
    expect(source.listenerCount()).toBe(0);
  });
});

describe('processingPercent', () => {
  it('rounds down and never says 100 while tesserae are missing', () => {
    expect(processingPercent({ done: 43, total: 100 })).toBe(43);
    expect(processingPercent({ done: 999, total: 1000 })).toBe(99);
    expect(processingPercent({ done: 1000, total: 1000 })).toBe(100);
    expect(processingPercent({ done: 0, total: 0 })).toBe(0);
  });
});
