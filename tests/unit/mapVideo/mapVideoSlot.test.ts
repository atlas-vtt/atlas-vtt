// @vitest-environment jsdom
import { TFile } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapVideoSlot, type MapVideoDeps, type MapVideoProblem } from '../../../src/app/pixi/mosaicCanvas/video/MapVideoSlot';
import type { OpenedVideo } from '../../../src/app/pixi/mosaicCanvas/video/videoElement';

const SIZE = { width: 128, height: 64 };

function file(path = 'maps/river.webm', mtime = 1): TFile {
  return Object.assign(new TFile(), { path, extension: 'webm', stat: { ctime: 0, mtime, size: 10 } });
}

/** A loaded video of `width` × `height` that counts its releases. */
function fakeVideo(width = SIZE.width, height = SIZE.height): OpenedVideo & { released: number } {
  const element = document.createElement('video');
  Object.defineProperty(element, 'videoWidth', { value: width });
  Object.defineProperty(element, 'videoHeight', { value: height });
  const video = {
    element,
    released: 0,
    release: (): void => {
      video.released++;
    },
  };
  return video;
}

interface Harness {
  deps: MapVideoDeps;
  opens: TFile[];
  problems: MapVideoProblem[];
  /** Hands the next open its video. */
  deliver(video: OpenedVideo): Promise<void>;
}

function harness(maxSide: number | null = 4096): Harness {
  const opens: TFile[] = [];
  const problems: MapVideoProblem[] = [];
  const waiting: Array<(video: OpenedVideo) => void> = [];
  return {
    opens,
    problems,
    deps: {
      open: (opened) => {
        opens.push(opened);
        return new Promise((resolve) => waiting.push(resolve));
      },
      maxTextureSize: () => maxSide,
      reportStill: (_file, problem) => problems.push(problem),
    },
    deliver: async (video) => {
      waiting.shift()?.(video);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('the video slot of a map image', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    Object.assign(HTMLVideoElement.prototype, {
      requestVideoFrameCallback: () => 1,
      cancelVideoFrameCallback: () => undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the video only once it plays', async () => {
    const { deps, opens } = harness();
    const slot = new MapVideoSlot(deps, () => undefined);
    slot.show(file(), SIZE);
    slot.setMode('poster');
    slot.setMode('pause');
    expect(opens).toHaveLength(0);
    slot.setMode('play');
    expect(opens).toHaveLength(1);
    slot.destroy();
  });

  it('releases the video, its object URL with it, when the map unloads', async () => {
    const run = harness();
    const slot = new MapVideoSlot(run.deps, () => undefined);
    slot.setMode('play');
    slot.show(file(), SIZE);
    const video = fakeVideo();
    await run.deliver(video);
    expect(slot.container.children).toHaveLength(1);
    slot.destroy();
    expect(video.released).toBe(1);
  });

  it('releases a video that arrives after another map was shown', async () => {
    const run = harness();
    const slot = new MapVideoSlot(run.deps, () => undefined);
    slot.setMode('play');
    slot.show(file(), SIZE);
    slot.show(null, SIZE);
    const late = fakeVideo();
    await run.deliver(late);
    expect(late.released).toBe(1);
    expect(slot.container.children).toHaveLength(0);
    slot.destroy();
  });

  it('keeps the video when the same file is shown again, and replaces it for another', async () => {
    const run = harness();
    const slot = new MapVideoSlot(run.deps, () => undefined);
    slot.setMode('play');
    slot.show(file(), SIZE);
    const first = fakeVideo();
    await run.deliver(first);
    slot.show(file(), SIZE);
    expect(run.opens).toHaveLength(1);
    slot.show(file('maps/other.webm'), SIZE);
    expect(first.released).toBe(1);
    expect(run.opens).toHaveLength(2);
    slot.destroy();
  });

  it('shows the poster and says why where the video is larger than the graphics can draw', async () => {
    const run = harness(64);
    const slot = new MapVideoSlot(run.deps, () => undefined);
    slot.setMode('play');
    slot.show(file(), SIZE);
    const video = fakeVideo();
    await run.deliver(video);
    expect(video.released).toBe(1);
    expect(slot.container.children).toHaveLength(0);
    expect(run.problems).toEqual([{ kind: 'too-large', width: 128, height: 64, maxSide: 64 }]);
    // Not tried again for the same map.
    slot.setMode('pause');
    slot.setMode('play');
    expect(run.opens).toHaveLength(1);
    slot.destroy();
  });

  it('plays nothing on a renderer that draws no video, without a word', async () => {
    const run = harness(null);
    const slot = new MapVideoSlot(run.deps, () => undefined);
    slot.setMode('play');
    slot.show(file(), SIZE);
    const video = fakeVideo();
    await run.deliver(video);
    expect(video.released).toBe(1);
    expect(run.problems).toEqual([]);
    slot.destroy();
  });
});
