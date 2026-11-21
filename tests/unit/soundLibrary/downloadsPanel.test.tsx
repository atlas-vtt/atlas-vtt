// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadManager } from '../../../src/app/downloads/DownloadManager';
import type { DownloadProgress, DownloadTask } from '../../../src/app/downloads/downloadTypes';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

let rig: LibraryRig;
let host: HTMLElement;
let manager: DownloadManager;

interface Driven {
  task: DownloadTask;
  progress: () => DownloadProgress;
  finish: () => void;
  fail: (error: Error) => void;
}

function driven(id: string, extra: Partial<DownloadTask> = {}): Driven {
  let current: DownloadProgress | null = null;
  let end: { resolve: () => void; reject: (error: Error) => void } | null = null;
  return {
    progress: () => {
      if (!current) throw new Error(`${id} is not running`);
      return current;
    },
    finish: () => end?.resolve(),
    fail: (error) => end?.reject(error),
    task: {
      id,
      title: `Pack ${id}`,
      origin: 'music-pack',
      estimate: { bytes: 260_000_000, files: 26 },
      run: (progress) => {
        current = progress;
        return new Promise<void>((resolve, reject) => { end = { resolve, reject }; });
      },
      ...extra,
    },
  };
}

const button = (): HTMLButtonElement | null => host.querySelector<HTMLButtonElement>('.atlas-sound-dl');
const panel = (): HTMLElement => screen.getByRole('dialog', { name: 'Downloads' });
const row = (title: string): HTMLElement => {
  const found = [...panel().querySelectorAll<HTMLElement>('.atlas-sound-downloads__job')].find((item) => item.textContent?.includes(title));
  if (!found) throw new Error(`no row ${title}`);
  return found;
};

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  rig.locations.music.addFile('Theme.ogg');
  host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  manager = DownloadManager.forApp(rig.app);
});

afterEach(() => {
  rig.unmount();
  host.remove();
  vi.restoreAllMocks();
});

describe('the downloads button and panel', () => {
  it('stands at the rail\'s foot only while there is a job, its ring telling how far the jobs ahead have come', async () => {
    await act(async () => rig.mount(host));
    expect(button()).toBeNull();
    const a = driven('a');
    await act(async () => manager.enqueue(a.task));
    await waitFor(() => expect(button()).not.toBeNull());
    expect(button()?.closest('.atlas-sound-lib__foot')).not.toBeNull();
    expect(button()?.dataset.face).toBe('active');
    expect(button()?.getAttribute('aria-label')).toBe('Downloads, 0%');
    a.progress().expect({ bytes: 200_000_000, files: 2 });
    a.progress().fileDone(100_000_000, true);
    await waitFor(() => expect(button()?.getAttribute('aria-label')).toBe('Downloads, 50%'));
    await act(async () => a.finish());
    await waitFor(() => expect(button()?.dataset.face).toBe('done'));
  });

  it('lists every job with its progress, Queued, Cancel and Retry, and starts the next once a cancelled run settles', async () => {
    await act(async () => rig.mount(host));
    const a = driven('a');
    const b = driven('b');
    await act(async () => {
      manager.enqueue(a.task);
      manager.enqueue(b.task);
    });
    await waitFor(() => expect(button()).not.toBeNull());
    await act(async () => button()?.click());
    expect(button()?.getAttribute('aria-expanded')).toBe('true');
    a.progress().fileDone(120_000_000, true);
    await waitFor(() => expect(row('Pack a').textContent).toContain('120 of 260 MB'));
    expect(within(row('Pack a')).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('46');
    expect(row('Pack b').textContent).toContain('Queued');

    await act(async () => within(row('Pack a')).getByRole('button', { name: 'Cancel' }).click());
    await waitFor(() => expect(row('Pack a').textContent).toContain('Cancelled'));
    expect(manager.job('b')?.state).toBe('queued');
    await act(async () => a.fail(new DOMException('aborted', 'AbortError')));
    await waitFor(() => expect(manager.job('b')?.state).toBe('downloading'));

    await act(async () => within(row('Pack a')).getByRole('button', { name: 'Try again' }).click());
    await waitFor(() => expect(row('Pack a').textContent).toContain('Queued'));
  });

  it('says why a job failed, shows a finished one in the library, and clears finished jobs', async () => {
    await act(async () => rig.mount(host));
    const reveal = vi.fn();
    const a = driven('a', { reveal });
    const b = driven('b', { explain: () => 'No connection' });
    await act(async () => {
      manager.enqueue(a.task);
      manager.enqueue(b.task);
    });
    await waitFor(() => expect(button()).not.toBeNull());
    await act(async () => a.finish());
    await waitFor(() => expect(manager.job('b')?.state).toBe('downloading'));
    await act(async () => b.fail(new Error('net::ERR_INTERNET_DISCONNECTED')));
    await waitFor(() => expect(button()?.dataset.face).toBe('failed'));
    await act(async () => button()?.click());
    expect(row('Pack b').textContent).toContain('No connection');
    expect(row('Pack a').textContent).toContain('Done · 260 MB');
    await act(async () => within(row('Pack a')).getByRole('button', { name: 'Show' }).click());
    expect(reveal).toHaveBeenCalledTimes(1);
    await act(async () => within(panel()).getByRole('button', { name: 'Clear finished' }).click());
    await waitFor(() => expect(button()).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Downloads' })).toBeNull();
  });

  it('closes on Escape, on a press outside it, and on a second press of its button', async () => {
    await act(async () => rig.mount(host));
    await act(async () => manager.enqueue(driven('a').task));
    await waitFor(() => expect(button()).not.toBeNull());
    await act(async () => button()?.click());
    expect(panel()).not.toBeNull();
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(screen.queryByRole('dialog', { name: 'Downloads' })).toBeNull();
    await act(async () => button()?.click());
    await act(async () => fireEvent.pointerDown(document.body));
    expect(screen.queryByRole('dialog', { name: 'Downloads' })).toBeNull();
    await act(async () => button()?.click());
    await act(async () => {
      fireEvent.pointerDown(button() as HTMLButtonElement);
      button()?.click();
    });
    expect(screen.queryByRole('dialog', { name: 'Downloads' })).toBeNull();
  });
});
