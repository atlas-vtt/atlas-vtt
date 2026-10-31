import { t } from '../../i18n';
import type { BandUnsupportedReason } from './bandTypes';

/**
 * The sentence shown for an image the browser cannot open that the band decoders refused: what it
 * is, and what to export instead; a file that could not be read at all gets its own.
 */
export function unsupportedMessage(width: number, height: number, reason: BandUnsupportedReason): string {
  if (reason === 'corrupt') return t('image.unreadable', { width, height });
  return t('image.unsupported', { width, height, advice: t(`image.unsupported.${reason}`) });
}
