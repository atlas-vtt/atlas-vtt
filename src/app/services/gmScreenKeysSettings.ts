import { isGmScreenDevice, parseLayout, type GmScreenLayout } from '../online/protocol/index.ts';
import { isRecord } from '../utils/guards';

/**
 * The GM screen's grids of keys as Atlas's settings keep them: one per kind of device, each only once the
 * GM changed it. A kind of device this version does not know is kept as it was written.
 */
export interface GmScreenKeys {
  readonly phone?: GmScreenLayout;
  readonly tablet?: GmScreenLayout;
  readonly [other: string]: unknown;
}

/** The stored grids, each read into a legal grid; nothing where none is stored. */
export function readGmScreenKeys(stored: unknown): GmScreenKeys | undefined {
  if (!isRecord(stored)) return undefined;
  const kept = Object.entries(stored).filter(([kind]) => !isGmScreenDevice(kind));
  const phone = parseLayout(stored.phone, 'phone');
  const tablet = parseLayout(stored.tablet, 'tablet');
  return { ...Object.fromEntries(kept), ...(phone && { phone }), ...(tablet && { tablet }) };
}
