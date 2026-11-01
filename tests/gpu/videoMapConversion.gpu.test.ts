import { describe, expect, it } from 'vitest';
import { convertVideoMap, VideoMapRefusedError } from '../../src/app/import/videoMaps/videoMapConversion';
import { videoMapWebm, VIDEO_MAP_SIZE } from '../fixtures/videoMapFixture';

const SPECS = { thumbnail: { size: 64, quality: 0.8 }, preview: { size: 128, quality: 0.8 } };

describe('a video as the map creator takes it, in a browser', () => {
  it('stays the file itself, with a card and a thumbnail of its first frame', async () => {
    const file = new File([videoMapWebm()], 'River.webm', { type: 'video/webm' });

    const result = await convertVideoMap(file, SPECS);

    expect(result.image).toBe(file);
    const card = await createImageBitmap(result.preview!);
    expect(Math.max(card.width, card.height)).toBeLessThanOrEqual(Math.max(VIDEO_MAP_SIZE.width, VIDEO_MAP_SIZE.height, SPECS.preview.size));
    expect(card.width / card.height).toBeCloseTo(VIDEO_MAP_SIZE.width / VIDEO_MAP_SIZE.height, 1);
    expect((await createImageBitmap(result.thumbnail!)).width).toBeLessThanOrEqual(SPECS.thumbnail.size);
  });

  it('refuses a file that is no video it can play', async () => {
    const file = new File([new Uint8Array(64)], 'Broken.mp4', { type: 'video/mp4' });

    await expect(convertVideoMap(file, SPECS)).rejects.toBeInstanceOf(VideoMapRefusedError);
  });
});
