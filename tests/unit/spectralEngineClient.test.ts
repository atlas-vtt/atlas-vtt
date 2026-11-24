// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGray } from '../../src/app/pixi/spectralEngine/detectGrid';
import type { DetectionOutcome } from '../../src/app/pixi/spectralEngine/detectionJob';
import type { DetectionReply, DetectionRequest } from '../../src/app/pixi/spectralEngine/detectionProtocol';

const runDetection = vi.fn<() => DetectionOutcome>();
vi.mock('../../src/app/pixi/spectralEngine/detectionJob', () => ({ runDetection: () => runDetection(), NO_GRID: { result: null, hits: null } }));

import { SpectralEngineClient } from '../../src/app/pixi/spectralEngine/SpectralEngineClient';

const FOUND: DetectionOutcome = { result: { gridType: 'square', cellSize: 64, offsetX: 1, offsetY: 2, confidence: 0.8 }, hits: null };

function gray(): MapGray {
  return { image: { width: 1, height: 1, data: new Float32Array(1) }, size: { width: 100, height: 100 } };
}

/** A worker that answers when the test says so. */
class FakeWorker extends EventTarget {
  readonly requests: DetectionRequest[] = [];
  terminated = false;

  postMessage(request: DetectionRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(reply: DetectionReply): void {
    this.dispatchEvent(new MessageEvent('message', { data: reply }));
  }

  fail(): void {
    this.dispatchEvent(new ErrorEvent('error', { message: 'no script', cancelable: true }));
  }
}

function clientWithWorkers(): { client: SpectralEngineClient; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const client = new SpectralEngineClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
  return { client, workers };
}

describe('SpectralEngineClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runDetection.mockReset();
    runDetection.mockReturnValue(FOUND);
  });
  afterEach(() => vi.useRealTimers());

  it('runs one detection at a time and sends a map image once', async () => {
    const { client, workers } = clientWithWorkers();
    const map = gray();
    const first = client.detect(map);
    const second = client.detect(map, { candidates: [FOUND.result!] });

    const worker = workers[0]!;
    expect(worker.requests).toHaveLength(1);
    expect(worker.requests[0]!.gray).toBe(map);
    worker.reply({ id: worker.requests[0]!.id, outcome: FOUND });
    await expect(first).resolves.toBe(FOUND);

    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]!.gray).toBeUndefined();
    expect(worker.requests[1]!.imageKey).toBe(worker.requests[0]!.imageKey);
    worker.reply({ id: worker.requests[1]!.id, outcome: FOUND });
    await expect(second).resolves.toBe(FOUND);
  });

  it('asks for the line evidence only where someone listens, and hands events on', async () => {
    const { client, workers } = clientWithWorkers();
    const onEvent = vi.fn();
    const watched = client.detect(gray(), { onEvent });
    const request = workers[0]!.requests[0]!;
    expect(request.ink).toBe(true);

    const fit = { type: 'fit' as const, fit: FOUND.result! };
    workers[0]!.reply({ id: request.id, event: fit });
    expect(onEvent).toHaveBeenCalledWith(fit);
    workers[0]!.reply({ id: request.id, outcome: FOUND });
    await watched;

    void client.detect(gray());
    expect(workers[0]!.requests[1]!.ink).toBe(false);
  });

  it('ends a running detection with its worker and starts the next on a new one', async () => {
    const { client, workers } = clientWithWorkers();
    const map = gray();
    const asked = new AbortController();
    const stale = client.detect(map, { signal: asked.signal });
    const next = client.detect(map);

    asked.abort();
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    // The new worker never saw the image.
    expect(workers[1]!.requests[0]!.gray).toBe(map);
    workers[1]!.reply({ id: workers[1]!.requests[0]!.id, outcome: FOUND });
    await expect(next).resolves.toBe(FOUND);
  });

  it('drops a detection ended while it waits, and leaves the running one alone', async () => {
    const { client, workers } = clientWithWorkers();
    const running = client.detect(gray());
    const asked = new AbortController();
    const waiting = client.detect(gray(), { signal: asked.signal });

    asked.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0]!.terminated).toBe(false);
    workers[0]!.reply({ id: workers[0]!.requests[0]!.id, outcome: FOUND });
    await expect(running).resolves.toBe(FOUND);
    expect(workers[0]!.requests).toHaveLength(1);
  });

  it('detects on the main thread where no worker can be made', async () => {
    const client = new SpectralEngineClient(() => {
      throw new Error('workers are blocked');
    });
    const detection = client.detect(gray());
    expect(runDetection).not.toHaveBeenCalled();
    vi.runAllTimers();
    await expect(detection).resolves.toBe(FOUND);
  });

  it('takes a worker that fails before its first answer for one that cannot run, and detects on the main thread from then on', async () => {
    const { client, workers } = clientWithWorkers();
    const detection = client.detect(gray());
    workers[0]!.fail();
    vi.runAllTimers();
    await expect(detection).resolves.toBe(FOUND);

    const later = client.detect(gray());
    vi.runAllTimers();
    await expect(later).resolves.toBe(FOUND);
    expect(workers).toHaveLength(1);
  });

  it('fails only the running detection when a worker that has answered before crashes', async () => {
    const { client, workers } = clientWithWorkers();
    const first = client.detect(gray());
    workers[0]!.reply({ id: workers[0]!.requests[0]!.id, outcome: FOUND });
    await first;

    const crashed = client.detect(gray());
    const next = client.detect(gray());
    workers[0]!.fail();
    await expect(crashed).rejects.toThrow('Grid detection failed');
    workers[1]!.reply({ id: workers[1]!.requests[0]!.id, outcome: FOUND });
    await expect(next).resolves.toBe(FOUND);
  });

  it('rejects everything once disposed, what waits as well as what runs', async () => {
    const { client, workers } = clientWithWorkers();
    const running = client.detect(gray());
    const waiting = client.detect(gray());
    client.dispose();
    await expect(running).rejects.toThrow('stopped');
    await expect(waiting).rejects.toThrow('stopped');
    expect(workers[0]!.terminated).toBe(true);
    await expect(client.detect(gray())).rejects.toThrow('stopped');
  });
});
