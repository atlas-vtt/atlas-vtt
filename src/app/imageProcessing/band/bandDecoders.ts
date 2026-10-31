import { bandDecodable as headerAllows } from '../decodeLimits';
import { imageHeader } from '../imageDimensions';
import type { BandDecoder } from './bandTypes';
import { jpegBandDecoder } from './jpegBandDecoder';
import { pngBandDecoder } from './pngBandDecoder';

/** The band decoder of a format, where one exists. */
export function bandDecoderFor(format: string): BandDecoder | null {
  if (format === 'jpeg') return jpegBandDecoder;
  if (format === 'png') return pngBandDecoder;
  return null;
}

/**
 * The decoder that reads `blob` in bands, where the browser cannot decode it whole and its header
 * is one the band decoders take (`bandDecodable` in `decodeLimits`); null where the browser
 * decodes it, or where nothing can.
 */
export async function bandDecodable(blob: Blob): Promise<BandDecoder | null> {
  const header = await imageHeader(blob);
  if (!header || !headerAllows(header)) return null;
  return bandDecoderFor(header.format);
}
