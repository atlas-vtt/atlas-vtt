import { describe, expect, it } from 'vitest';
import { coverRect } from '../../../src/app/dungeons/scene/sceneThumbnail';

describe('the crop of a new dungeon scene’s thumbnail', () => {
  it('covers the thumbnail with the picture, centred, as a map view’s thumbnail does', () => {
    // A tall map: as wide as the thumbnail, its top and bottom cut off alike
    expect(coverRect({ width: 300, height: 600 }, { width: 400, height: 300 })).toEqual({ x: 0, y: -250, width: 400, height: 800 });
    // A wide one: as tall, cut off left and right
    expect(coverRect({ width: 800, height: 300 }, { width: 400, height: 300 })).toEqual({ x: -200, y: 0, width: 800, height: 300 });
    expect(coverRect({ width: 800, height: 600 }, { width: 400, height: 300 })).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });
});
