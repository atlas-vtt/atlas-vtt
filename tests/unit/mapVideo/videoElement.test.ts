// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openVideoElement, type ObjectUrls } from '../../../src/app/pixi/mosaicCanvas/video/videoElement';

function trackedUrls(): ObjectUrls & { live: Set<string> } {
  const live = new Set<string>();
  let next = 0;
  return {
    live,
    createObjectURL: () => {
      const url = `blob:video-${next++}`;
      live.add(url);
      return url;
    },
    revokeObjectURL: (url) => {
      live.delete(url);
    },
  };
}

/** The video the next open makes, once it was given its source. */
function lastVideo(): HTMLVideoElement {
  const video = created.at(-1);
  if (!video) throw new Error('No video was made.');
  return video;
}

const created: HTMLVideoElement[] = [];

describe('the video of an animated map', () => {
  beforeEach(() => {
    created.length = 0;
    // jsdom plays nothing: the element's media methods do nothing here.
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const create = Document.prototype.adoptNode;
    vi.spyOn(Document.prototype, 'adoptNode').mockImplementation(function (this: Document, node) {
      const adopted = create.call(this, node);
      if (adopted instanceof HTMLVideoElement) created.push(adopted);
      return adopted;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is muted, loops and plays inline, from an object URL of the bytes', async () => {
    const urls = trackedUrls();
    const opening = openVideoElement(document, new Uint8Array([1, 2, 3]), 'video/webm', urls);
    const video = lastVideo();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.getAttribute('src')).toBe([...urls.live][0]);
    video.dispatchEvent(new Event('loadeddata'));
    const opened = await opening;
    expect(opened.element).toBe(video);
  });

  it('revokes its URL and drops its source when released, once', async () => {
    const urls = trackedUrls();
    const revoke = vi.spyOn(urls, 'revokeObjectURL');
    const opening = openVideoElement(document, new Uint8Array([1]), 'video/mp4', urls);
    lastVideo().dispatchEvent(new Event('loadeddata'));
    const opened = await opening;
    opened.release();
    opened.release();
    expect(urls.live.size).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(opened.element.getAttribute('src')).toBeNull();
  });

  it('revokes its URL when the video cannot be played', async () => {
    const urls = trackedUrls();
    const opening = openVideoElement(document, new Uint8Array([1]), 'video/mp4', urls);
    lastVideo().dispatchEvent(new Event('error'));
    await expect(opening).rejects.toThrow();
    expect(urls.live.size).toBe(0);
  });

  it('gives up and revokes its URL when the video neither loads nor fails', async () => {
    vi.useFakeTimers();
    try {
      const urls = trackedUrls();
      const opening = openVideoElement(document, new Uint8Array([1]), 'video/webm', urls);
      const failed = expect(opening).rejects.toThrow('did not load');
      await vi.advanceTimersByTimeAsync(30_000);
      await failed;
      expect(urls.live.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
