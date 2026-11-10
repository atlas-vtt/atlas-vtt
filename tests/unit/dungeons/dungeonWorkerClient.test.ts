// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { DungeonWorkerClient } from '../../../src/app/dungeons/worker/DungeonWorkerClient';
import type { DungeonJob, DungeonRendered, DungeonWorkerMessage, DungeonWorkerReply } from '../../../src/app/dungeons/worker/dungeonJob';
import { smallDungeon } from '../../fixtures/dungeonModels';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';

/** A worker that keeps what it is sent and answers when the test says so. */
class FakeWorker {
  readonly sent: DungeonWorkerMessage[] = [];
  terminated = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  postMessage(message: DungeonWorkerMessage): void {
    this.sent.push(message);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** The id of the last render job sent. */
  lastJob(): number {
    return this.sent[this.sent.length - 1]!.id;
  }

  answer(reply: DungeonWorkerReply): void {
    for (const listener of this.listeners.get('message') ?? []) listener({ data: reply });
  }

  crash(): void {
    for (const listener of this.listeners.get('error') ?? []) listener({ message: 'boom', preventDefault: () => {} });
  }
}

const job = (seed: number): DungeonJob => ({
  request: { seed, tags: [] },
  style: dungeonStyle('parchment'),
  view: DEFAULT_VIEW,
  output: { kind: 'preview', width: 1400, height: 1000 },
});

function rendered(close = vi.fn()): DungeonRendered {
  const model = smallDungeon();
  return { model, map: mapLayout(model, 30), image: { type: 'bitmap', bitmap: { close } as unknown as ImageBitmap } };
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function clientWith(workers: FakeWorker[], inThread?: (job: DungeonJob) => Promise<DungeonRendered>): DungeonWorkerClient {
  return new DungeonWorkerClient({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    ...(inThread && { inThread }),
  });
}

afterEach(() => { vi.restoreAllMocks(); });

describe('the dungeon worker client', () => {
  it('starts one worker and answers each job', async () => {
    const workers: FakeWorker[] = [];
    const client = clientWith(workers);

    const first = client.render(job(1));
    expect(workers).toHaveLength(1);
    const result = rendered();
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result });
    await expect(first).resolves.toBe(result);

    const second = client.render(job(2));
    await flush();
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: false, message: 'No canvas' });
    await expect(second).rejects.toThrow('No canvas');
    expect(workers).toHaveLength(1);
  });

  it('lets the latest preview win: queued ones give way, a running one is dropped', async () => {
    const workers: FakeWorker[] = [];
    const client = clientWith(workers);

    const running = client.preview(job(1));
    const queued = client.preview(job(2));
    const latest = client.preview(job(3));
    await expect(queued).resolves.toBeNull();

    const close = vi.fn();
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result: rendered(close) });
    await expect(running).resolves.toBeNull();
    expect(close).toHaveBeenCalled();

    await flush();
    const sentSeeds = workers[0]!.sent.map(m => m.job.request.seed);
    expect(sentSeeds).toEqual([1, 3]);
    const result = rendered();
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result });
    await expect(latest).resolves.toBe(result);
  });

  it('never drops a render for a preview', async () => {
    const workers: FakeWorker[] = [];
    const client = clientWith(workers);

    const render = client.render(job(1));
    void client.preview(job(2));
    const result = rendered();
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result });
    await expect(render).resolves.toBe(result);
  });

  it('draws thumbnails only while no preview waits, and drops them on request', async () => {
    const workers: FakeWorker[] = [];
    const client = clientWith(workers);
    const thumbnail = (seed: number): DungeonJob => ({ ...job(seed), output: { kind: 'thumbnail', width: 272, height: 204, legibleAt: 2 } });

    const running = client.thumbnail(thumbnail(1));
    const waiting = client.thumbnail(thumbnail(2));
    const preview = client.preview(job(3));
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result: rendered() });
    await expect(running).resolves.not.toBeNull();

    // The preview asked for later goes before the thumbnail still waiting
    await flush();
    expect(workers[0]!.sent.map(m => m.job.request.seed)).toEqual([1, 3]);
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result: rendered() });
    await expect(preview).resolves.not.toBeNull();

    await flush();
    expect(workers[0]!.sent.map(m => m.job.request.seed)).toEqual([1, 3, 2]);
    const late = client.thumbnail(thumbnail(4));
    client.dropThumbnails();
    await expect(late).resolves.toBeNull();
    const close = vi.fn();
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result: rendered(close) });
    await expect(waiting).resolves.toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('drops only the thumbnails of the group asked, the running one included', async () => {
    const workers: FakeWorker[] = [];
    const client = clientWith(workers);
    const thumbnail = (seed: number): DungeonJob => ({ ...job(seed), output: { kind: 'thumbnail', width: 272, height: 204, legibleAt: 2 } });

    const running = client.thumbnail(thumbnail(1), 'themes');
    const style = client.thumbnail(thumbnail(2), 'styles');
    const theme = client.thumbnail(thumbnail(3), 'themes');
    client.dropThumbnails('themes');
    await expect(theme).resolves.toBeNull();
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result: rendered() });
    await expect(running).resolves.toBeNull();
    await flush();
    expect(workers[0]!.sent.map(m => m.job.request.seed)).toEqual([1, 2]);
    workers[0]!.answer({ id: workers[0]!.lastJob(), ok: true, result: rendered() });
    await expect(style).resolves.not.toBeNull();
  });

  it('shares thumbnails out to helper workers, drops them there too, and stops an idle helper', async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const client = new DungeonWorkerClient({
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
      helpers: 2,
    });
    const thumbnail = (seed: number): DungeonJob => ({ ...job(seed), output: { kind: 'thumbnail', width: 272, height: 204, legibleAt: 2 } });

    const preview = client.preview(job(1));
    const drawn = [2, 3, 4].map(seed => client.thumbnail(thumbnail(seed), 'styles'));
    const dropped = client.thumbnail(thumbnail(5), 'styles');
    // The main worker draws the preview; the first three thumbnails each go to whoever is least busy
    expect(workers.map(worker => worker.sent.map(m => m.job.request.seed))).toEqual([[1], [2], [3]]);

    client.dropThumbnails('styles');
    await expect(dropped).resolves.toBeNull();
    for (const worker of workers) worker.answer({ id: worker.lastJob(), ok: true, result: rendered() });
    await expect(preview).resolves.not.toBeNull();
    await expect(Promise.all(drawn)).resolves.toEqual([null, null, null]);

    vi.advanceTimersByTime(60_000);
    expect(workers.map(worker => worker.terminated)).toEqual([false, true, true]);
    client.dispose();
    vi.useRealTimers();
  });

  it('fails the job of a worker that crashed and starts a new one for the next', async () => {
    const workers: FakeWorker[] = [];
    const client = clientWith(workers);

    const lost = client.render(job(1));
    workers[0]!.crash();
    await expect(lost).rejects.toThrow('boom');
    expect(workers[0]!.terminated).toBe(true);

    const next = client.render(job(2));
    expect(workers).toHaveLength(2);
    const result = rendered();
    workers[1]!.answer({ id: workers[1]!.lastJob(), ok: true, result });
    await expect(next).resolves.toBe(result);
  });

  it('draws in the window when no worker can start', async () => {
    const result = rendered();
    const inThread = vi.fn(async () => result);
    const client = new DungeonWorkerClient({
      createWorker: () => { throw new Error('No workers here'); },
      inThread,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(client.render(job(1))).resolves.toBe(result);
    expect(inThread).toHaveBeenCalledOnce();
  });

  it('fails every job once disposed', async () => {
    const workers: FakeWorker[] = [];
    const client = clientWith(workers);
    const running = client.render(job(1));
    const queued = client.render(job(2));

    client.dispose();

    await expect(running).rejects.toThrow('stopped');
    await expect(queued).rejects.toThrow('stopped');
    expect(workers[0]!.terminated).toBe(true);
    await expect(client.render(job(3))).rejects.toThrow('stopped');
  });
});
