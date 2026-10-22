import { describe, expect, it } from 'vitest';
import { MAX_ASSET_BYTES, parseGmMessage } from '../../../../src/app/online/protocol/index.ts';

const image = { hash: 'a'.repeat(64), size: 1234, mime: 'image/png' };
const shown = { id: '0123456789abcdef01234567', image, width: 1600, height: 900 };
const message = (value: unknown): unknown => ({ t: 'shown-image', shown: value });

describe('shown-image messages', () => {
  it('read a showing, and that none is shown', () => {
    expect(parseGmMessage(message(shown))).toEqual({ t: 'shown-image', shown });
    expect(parseGmMessage(message(null))).toEqual({ t: 'shown-image', shown: null });
    for (const mime of ['image/jpeg', 'image/webp', 'image/gif', 'image/avif']) expect(parseGmMessage(message({ ...shown, image: { ...image, mime } })), mime).not.toBeNull();
  });

  it('keep only what a page lays the image out by: a file\'s name or path is never read', () => {
    const named = { ...shown, name: 'The traitor.png', path: 'Handouts/The traitor.png', image: { ...image, path: 'Handouts/The traitor.png' } };
    expect(parseGmMessage({ ...(message(named) as object), name: 'The traitor.png' })).toEqual({ t: 'shown-image', shown });
  });

  it('refuse a showing without an id of its own, a size or an image a page may draw', () => {
    for (const value of [
      undefined, 'image', [], {}, { ...shown, id: undefined }, { ...shown, id: 'short' }, { ...shown, id: `${shown.id}0` }, { ...shown, id: shown.id.toUpperCase() }, { ...shown, id: 7 },
      { ...shown, width: 0 }, { ...shown, width: -4 }, { ...shown, width: 1.5 }, { ...shown, width: '1600' }, { ...shown, height: undefined }, { ...shown, height: Number.NaN }, { ...shown, height: (1 << 20) + 1 },
      { ...shown, image: null }, { ...shown, image: undefined }, { ...shown, image: 'a'.repeat(64) },
      { ...shown, image: { ...image, hash: 'A'.repeat(64) } }, { ...shown, image: { ...image, hash: 'abc' } },
      { ...shown, image: { ...image, size: -1 } }, { ...shown, image: { ...image, size: MAX_ASSET_BYTES + 1 } },
    ]) expect(parseGmMessage(message(value)), JSON.stringify(value)).toBeNull();
  });

  it('refuse every type but the images players are sent: no SVG, no page, no script', () => {
    for (const mime of ['image/svg+xml', 'image/bmp', 'text/html', 'application/javascript', 'application/pdf', 'IMAGE/PNG', '', undefined, 7]) {
      expect(parseGmMessage(message({ ...shown, image: { ...image, mime } })), String(mime)).toBeNull();
    }
  });
});
