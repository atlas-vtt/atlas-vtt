// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageDecodeError, ImageWorkerPool } from '../../src/app/imageProcessing/ImageWorkerPool';
import type { ImageJob, ImageJobRequest, ImageJobResponse, ImageJobResult } from '../../src/app/imageProcessing/imageJob';

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  readonly posted: ImageJobRequest[] = [];
  terminated = false;

  constructor() {
    super();
    FakeWorker.instances.push(this);
  }

  postMessage(request: ImageJobRequest): void {
    this.posted.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(response: ImageJobResponse): void {
    this.dispatchEvent(new MessageEvent('message', { data: response }));
  }

  succeed(result: ImageJobResult = RESULT): void {
    const request = this.posted.at(-1)!;
    this.reply({ id: request.id, ok: true, result });
  }

  crash(message: string): void {
    this.dispatchEvent(new ErrorEvent('error', { message, cancelable: true }));
  }
}

const RESULT: ImageJobResult = { image: new Blob(['webp']), thumbnail: null, preview: null };
const job = (): ImageJob => ({ source: new Blob(['png']), layout: { kind: 'fit', maxWidth: 10, maxHeight: 10 }, quality: 0.8 });
const flush = (): Promise<void> => new Promise(resolve => queueMicrotask(resolve));

const MB = 1024 * 1024;
function createPool(maxWorkers: number, idleTimeoutMs = 1000, jobTimeoutMs = 5000): ImageWorkerPool {
  return new ImageWorkerPool(() => new FakeWorker() as unknown as Worker, { maxWorkers, memoryBudget: 100 * MB, idleTimeoutMs, jobTimeoutMs });
}

describe('ImageWorkerPool', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('runs at most one job per worker and starts queued jobs in order as workers free up', async () => {
    const pool = createPool(2);
    const results = [1, 2, 3].map(() => pool.run(job(), { cost: MB }));
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances.map(w => w.posted.length)).toEqual([1, 1]);

    FakeWorker.instances[1]!.succeed();
    await expect(results[1]).resolves.toBe(RESULT);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1]!.posted.map(r => r.id)).toEqual([2, 3]);

    FakeWorker.instances[0]!.succeed();
    FakeWorker.instances[1]!.succeed();
    await expect(Promise.all(results)).resolves.toHaveLength(3);
  });

  it('runs jobs together only while their memory fits the budget, and unknown or oversized jobs alone', () => {
    const pool = createPool(4);
    void pool.run(job(), { cost: 60 * MB });
    void pool.run(job(), { cost: 60 * MB });
    void pool.run(job(), { cost: 30 * MB });
    void pool.run(job());
    expect(FakeWorker.instances.map(w => w.posted[0]!.id)).toEqual([1, 3]);

    FakeWorker.instances[0]!.succeed();
    FakeWorker.instances[1]!.succeed();
    expect(FakeWorker.instances.flatMap(w => w.posted.map(r => r.id))).toEqual([1, 2, 3]);

    FakeWorker.instances[0]!.succeed();
    expect(FakeWorker.instances[0]!.posted.map(r => r.id)).toEqual([1, 2, 4]);
    void pool.run(job(), { cost: MB });
    expect(FakeWorker.instances.flatMap(w => w.posted)).toHaveLength(4);
  });

  it('starts jobs someone waits for before queued background work', () => {
    const pool = createPool(1);
    void pool.run(job());
    void pool.run(job(), { background: true });
    void pool.run(job(), { background: true });
    void pool.run(job());
    const [worker] = FakeWorker.instances;
    worker!.succeed();
    worker!.succeed();
    expect(worker!.posted.map(r => r.id)).toEqual([1, 4, 2]);
  });

  it('fails a job whose worker cannot start instead of keeping it queued', async () => {
    const pool = new ImageWorkerPool(() => { throw new Error('Workers are unavailable'); }, { maxWorkers: 1, memoryBudget: MB });
    await expect(pool.run(job())).rejects.toThrow('Workers are unavailable');
    await expect(pool.run(job())).rejects.toThrow('Workers are unavailable');
  });

  it('drops a cancelled queued job and stops the worker of a cancelled running one', async () => {
    const pool = createPool(1);
    const running = new AbortController();
    const queued = new AbortController();
    const first = pool.run(job(), { signal: running.signal });
    const second = pool.run(job(), { signal: queued.signal });
    const third = pool.run(job());

    queued.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    running.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    const [stopped, replacement] = FakeWorker.instances;
    expect(stopped!.terminated).toBe(true);
    expect(replacement!.posted.map(r => r.id)).toEqual([3]);
    replacement!.succeed();
    await expect(third).resolves.toBe(RESULT);
  });

  it('frees the budget of a cancelled running job at once', async () => {
    const pool = new ImageWorkerPool(() => new FakeWorker() as unknown as Worker, { maxWorkers: 2, memoryBudget: 100 * MB });
    const huge = new AbortController();
    const cancelled = pool.run(job(), { signal: huge.signal, cost: 150 * MB });
    void pool.run(job(), { cost: 10 * MB });
    expect(FakeWorker.instances.flatMap(w => w.posted)).toHaveLength(1);
    huge.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances.at(-1)!.posted.map(r => r.id)).toEqual([2]);
  });

  it('frees a transferred bitmap when it refuses a job', async () => {
    const pool = createPool(1);
    pool.dispose();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    await expect(pool.run(job(), { transfer: [bitmap] })).rejects.toThrow('stopped');
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('rejects an already cancelled job without starting a worker', async () => {
    const pool = createPool(1);
    await expect(pool.run(job(), { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('fails only the job of a crashed worker and replaces the worker', async () => {
    const pool = createPool(1);
    const crashed = pool.run(job());
    const next = pool.run(job());
    const [first] = FakeWorker.instances;
    first!.crash('Out of memory');
    await expect(crashed).rejects.toThrow('Out of memory');
    expect(first!.terminated).toBe(true);

    const [, replacement] = FakeWorker.instances;
    expect(replacement!.posted.map(r => r.id)).toEqual([2]);
    replacement!.succeed();
    await expect(next).resolves.toBe(RESULT);
  });

  it('reports sources the worker cannot decode', async () => {
    const pool = createPool(1);
    const result = pool.run(job());
    FakeWorker.instances[0]!.reply({ id: 1, ok: false, message: 'The source image could not be decoded.', decodeFailed: true });
    await expect(result).rejects.toBeInstanceOf(ImageDecodeError);
  });

  it('stops a worker that does not answer in time', async () => {
    const pool = createPool(1, 1000, 5000);
    const result = pool.run(job());
    vi.advanceTimersByTime(5000);
    await expect(result).rejects.toThrow('took too long');
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
  });

  it('stops idle workers and starts new ones for later jobs', async () => {
    const pool = createPool(2, 1000);
    const result = pool.run(job());
    FakeWorker.instances[0]!.succeed();
    await result;
    vi.advanceTimersByTime(999);
    expect(FakeWorker.instances[0]!.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(FakeWorker.instances[0]!.terminated).toBe(true);

    void pool.run(job());
    await flush();
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('fails every job and stops all workers when disposed', async () => {
    const pool = createPool(1);
    const running = pool.run(job());
    const queued = pool.run(job());
    pool.dispose();
    await expect(running).rejects.toThrow('stopped');
    await expect(queued).rejects.toThrow('stopped');
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    await expect(pool.run(job())).rejects.toThrow('stopped');
  });
});
