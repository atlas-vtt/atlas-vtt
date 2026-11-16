import { describe, expect, it } from 'vitest';
import { creatorForDroppedFiles } from '../../src/app/packages/components/asset-manager/utils/droppedFiles';

const image = new File(['art'], 'Wolf.png', { type: 'image/png' });
const video = new File(['video'], 'River.webm', { type: 'video/webm' });

describe('the creator that opens with files dropped on the window', () => {
  it.each([
    ['tokens', 'token'],
    ['party', 'token'],
    ['maps', 'map'],
    ['scenes', 'map'],
    ['encounters', 'map'],
  ] as const)('on the %s tab images open the %s creator', (tab, creator) => {
    expect(creatorForDroppedFiles([image], tab)).toBe(creator);
  });

  it('takes a video, and the images dropped with it, to the map creator on any tab', () => {
    expect(creatorForDroppedFiles([image, video], 'tokens')).toBe('map');
  });
});
