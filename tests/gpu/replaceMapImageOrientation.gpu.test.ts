import { describe, expect, it } from 'vitest';
import { grayJpeg } from '../../src/app/imageProcessing/__tests__/grayJpeg';
import { replacementFit } from '../../src/app/levels/levelImageReplace';
import { decodeSource } from '../../src/app/pixi/mapImage/decodedLevels';
import { browserGraphicsPrimitives, createTileGraphics } from '../../src/app/pixi/mapImage/tileGraphics';

/**
 * Replace map image compares the sizes of the pyramids the map is drawn from (`mapImageSize`), and a
 * pyramid takes the size of the decoded image, turned by its EXIF orientation as the map shows it,
 * never the header's stored size. A phone photo of a map stored on its side and turned by EXIF must
 * therefore be taken for the shape it shows. Only a real decoder turns it, so this runs in the browser.
 */
describe('replacing a map with a photo turned by EXIF', () => {
  const scene = { levels: undefined, grid: null };

  it('reads the turned photo at the shape it shows, and fits it onto a map of that shape', async () => {
    // Stored 400 × 200, shown turned a quarter (orientation 6): 200 × 400.
    const { pyramid, bitmap } = await decodeSource(grayJpeg(400, 200, 6), createTileGraphics(browserGraphicsPrimitives()));
    bitmap.close();
    const shown = { width: pyramid.width, height: pyramid.height };
    expect(shown).toEqual({ width: 200, height: 400 });

    expect(replacementFit(scene, null, { width: 1000, height: 2000 }, shown)).toMatchObject({ kind: 'scaled', alignment: { scale: 5 } });
    expect(replacementFit(scene, null, { width: 2000, height: 1000 }, shown)).toEqual({ kind: 'aspect' });
  });

  it('reads a photo stored upright at its stored shape', async () => {
    const { pyramid, bitmap } = await decodeSource(grayJpeg(400, 200, 1), createTileGraphics(browserGraphicsPrimitives()));
    bitmap.close();
    expect({ width: pyramid.width, height: pyramid.height }).toEqual({ width: 400, height: 200 });
  });
});
