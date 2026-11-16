import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertVideoMap, VideoMapRefusedError } from '../../../src/app/import/videoMaps/videoMapConversion';
import { renderThumbnail } from '../../../src/app/imageProcessing/imageProcessing';
import { MAX_VIDEO_MAP_BYTES } from '../../../src/app/pixi/mosaicCanvas/video/videoMapFiles';
import { videoPosterBlob } from '../../../src/app/pixi/mosaicCanvas/video/videoPoster';

vi.mock('../../../src/app/pixi/mosaicCanvas/video/videoPoster', () => ({ videoPosterBlob: vi.fn() }));
vi.mock('../../../src/app/imageProcessing/imageProcessing', () => ({ renderThumbnail: vi.fn() }));

const SPECS = { thumbnail: { size: 256, quality: 0.8 }, preview: { size: 640, quality: 0.8 } };
const river = new File(['video'], 'River.MP4', { type: 'video/mp4' });
const poster = new Blob(['poster'], { type: 'image/png' });

beforeEach(() => {
  vi.mocked(videoPosterBlob).mockReset().mockResolvedValue(poster);
  vi.mocked(renderThumbnail).mockReset().mockResolvedValue(new ArrayBuffer(4));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('a video as the creator converts it', () => {
  it('stays the file itself, with a card and a thumbnail made of its first frame', async () => {
    const result = await convertVideoMap(river, SPECS);

    expect(result.image).toBe(river);
    expect(result.preview?.type).toBe('image/webp');
    expect(result.thumbnail?.type).toBe('image/webp');
    expect(videoPosterBlob).toHaveBeenCalledExactlyOnceWith(river, 'video/mp4');
    expect(vi.mocked(renderThumbnail).mock.calls.map(([source, spec]) => [source, spec])).toEqual([[poster, SPECS.preview], [poster, SPECS.thumbnail]]);
  });

  it('refuses a video larger than the limit without opening it', async () => {
    const huge = new File([], 'Huge.mp4');
    Object.defineProperty(huge, 'size', { value: MAX_VIDEO_MAP_BYTES + 1 });

    await expect(convertVideoMap(huge, SPECS)).rejects.toBeInstanceOf(VideoMapRefusedError);
    expect(videoPosterBlob).not.toHaveBeenCalled();
  });

  it('refuses a video that cannot be played here', async () => {
    vi.mocked(videoPosterBlob).mockRejectedValue(new Error('no decoder'));

    await expect(convertVideoMap(river, SPECS)).rejects.toBeInstanceOf(VideoMapRefusedError);
  });

  it('shows the first frame itself where no smaller copy could be made, and leaves the thumbnail to the background pass', async () => {
    vi.mocked(renderThumbnail).mockRejectedValue(new Error('worker gone'));

    const result = await convertVideoMap(river, SPECS);

    expect(result.preview).toBe(poster);
    expect(result.thumbnail).toBeNull();
  });

  it('opens one video at a time, and goes on after one that failed', async () => {
    let finishFirst: (error: Error) => void = () => undefined;
    vi.mocked(videoPosterBlob).mockReturnValueOnce(new Promise((_, reject) => { finishFirst = reject; }));

    const first = convertVideoMap(river, SPECS);
    const second = convertVideoMap(river, SPECS);
    await vi.waitFor(() => expect(videoPosterBlob).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(videoPosterBlob).toHaveBeenCalledTimes(1);

    finishFirst(new Error('no decoder'));
    await expect(first).rejects.toBeInstanceOf(VideoMapRefusedError);
    await expect(second).resolves.toMatchObject({ image: river });
  });

  it('opens nothing once it is cancelled', async () => {
    const cancelled = new AbortController();
    cancelled.abort();

    await expect(convertVideoMap(river, SPECS, cancelled.signal)).rejects.toThrow();
    expect(videoPosterBlob).not.toHaveBeenCalled();
  });
});
