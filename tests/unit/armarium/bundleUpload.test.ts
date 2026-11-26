import { describe, expect, it, vi } from 'vitest';
import { BundleUpload, UploadCancelled } from '../../../src/app/armarium/upload/BundleUpload';
import { failurePlan, partRanges } from '../../../src/app/armarium/upload/uploadParts';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeArmarium, noSleep } from './shareFakes';
import { UPLOAD_LIMITS } from '../../../src/app/armarium/upload/uploadContract';

const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const blob = (): Blob => new Blob([BYTES]);

function upload(api: FakeArmarium, sleep = noSleep): { run: BundleUpload; seen: string[][] } {
  const seen: string[][] = [];
  const run = new BundleUpload(blob(), 'Caves v3.atlas-collection.zip', { api, sha256: (bytes) => sha256(bytes), sleep }, (progress) => seen.push([...progress.parts]));
  return { run, seen };
}

describe('the parts of an upload', () => {
  it('cuts a file into parts of the ticket\'s size, the last one the remainder', () => {
    expect(partRanges(10, 4)).toEqual([{ n: 1, start: 0, end: 4 }, { n: 2, start: 4, end: 8 }, { n: 3, start: 8, end: 10 }]);
    expect(() => partRanges(0, 4)).toThrow(RangeError);
  });

  it('retries failures of the way twice, stops at once on a refusal, and ends the ticket where it took no more', () => {
    expect(failurePlan({ status: 0, code: 'network' }, 0)).toEqual({ action: 'retry', delayMs: 1000 });
    expect(failurePlan({ status: 503, code: 'internal' }, 1)).toEqual({ action: 'retry', delayMs: 4000 });
    expect(failurePlan({ status: 0, code: 'network' }, 2)).toEqual({ action: 'stop', keepTicket: true });
    expect(failurePlan({ status: 403, code: 'too-many-today' }, 0)).toEqual({ action: 'stop', keepTicket: true });
    expect(failurePlan({ status: 410, code: 'upload-expired' }, 0)).toEqual({ action: 'stop', keepTicket: false });
  });
});

describe('a bundle upload', () => {
  it('sends every part with the SHA-256 of its bytes, then completes', async () => {
    const api = new FakeArmarium();
    const { run, seen } = upload(api);
    const view = await run.start();
    expect(view.state).toBe('checking');
    expect([...api.parts.keys()].sort()).toEqual([1, 2, 3]);
    expect(api.parts.get(1)).toEqual({ bytes: 4, sha256: await sha256(BYTES.slice(0, 4)) });
    expect(api.parts.get(3)).toEqual({ bytes: 2, sha256: await sha256(BYTES.slice(8, 10)) });
    expect(api.calls.at(-1)).toBe('complete');
    expect(run.progress()).toMatchObject({ parts: ['sent', 'sent', 'sent'], sentBytes: 10, totalBytes: 10, failure: null });
    // Each part went from waiting through sending to sent.
    expect(seen[0]).toEqual(['waiting', 'waiting', 'waiting']);
  });

  it('sends a part again after a failure of the way, waiting between the tries', async () => {
    const api = new FakeArmarium();
    api.fail('part 2', { status: 0, code: 'network' }, { status: 503, code: 'internal' });
    const sleep = vi.fn(noSleep);
    const { run } = upload(api, sleep);
    await run.start();
    expect(api.calls.filter((call) => call === 'part 2')).toHaveLength(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 4000]);
  });

  it('stops with the part marked when it keeps failing, and Retry sends only what the Armarium lacks', async () => {
    const api = new FakeArmarium();
    api.fail('part 2', { status: 0, code: 'network' }, { status: 0, code: 'network' }, { status: 0, code: 'network' });
    const { run } = upload(api);
    await expect(run.start()).rejects.toMatchObject({ code: 'network' });
    expect(run.progress().parts).toEqual(['sent', 'failed', 'sent']);
    expect(run.progress().failure).toEqual({ code: 'network', until: null });
    api.calls.length = 0;
    await run.retry();
    expect(api.calls).toEqual(['submission', 'part 2', 'complete']);
    expect(run.progress().parts).toEqual(['sent', 'sent', 'sent']);
  });

  it('keeps the ticket through a refusal, and asks for a new one where the ticket ended', async () => {
    const api = new FakeArmarium();
    api.fail('part 1', { status: 410, code: 'upload-expired' });
    const { run } = upload(api);
    await expect(run.start()).rejects.toMatchObject({ code: 'upload-expired' });
    api.calls.length = 0;
    await run.retry();
    expect(api.calls[0]).toBe('ticket');
    expect(run.submissionId).toBe('sub-2');
  });

  it('sends a part the completion finds missing, and completes again', async () => {
    const api = new FakeArmarium();
    api.fail('complete', { status: 409, code: 'upload-incomplete' });
    const { run } = upload(api);
    const view = await run.start();
    expect(view.state).toBe('checking');
    expect(api.calls.filter((call) => call === 'complete')).toHaveLength(2);
  });

  it('refuses a bundle larger than the Armarium takes before asking for a ticket', async () => {
    const api = new FakeArmarium();
    const huge = { size: UPLOAD_LIMITS.maxBytes + 1, slice: () => blob() } as unknown as Blob;
    const run = new BundleUpload(huge, 'big.zip', { api, sha256: (bytes) => sha256(bytes), sleep: noSleep });
    await expect(run.start()).rejects.toMatchObject({ code: 'too-large' });
    expect(api.calls).toEqual([]);
  });

  it('cancels: sends nothing more and discards the submission', async () => {
    const api = new FakeArmarium();
    api.fail('part 1', { status: 0, code: 'network' });
    let release: () => void = () => undefined;
    const sleep = (_ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
      release = resolve;
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const { run } = upload(api, sleep);
    const started = run.start();
    await vi.waitFor(() => expect(api.calls).toContain('part 1'));
    await run.cancel();
    release();
    await expect(started).rejects.toBeInstanceOf(UploadCancelled);
    expect(api.discarded).toEqual(['sub-1']);
    expect(api.calls).not.toContain('complete');
  });
});
