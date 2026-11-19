import { sha256 } from '../../utils/hashing';
import type { ItemKind } from './itemBundleFormat';

/**
 * The Armarium listing uid of an item an account shares: the first 32 hex digits of the SHA-256 of
 * `atlas-armarium-item\n<account id>\n<kind>\n<item id>`. Worked out, never stored: two vaults of one
 * account continue one listing, another account sharing the same item gets a listing of its own,
 * and a copy (a new id) a new one. Its output names listings on the server, so changing it is a
 * data change.
 */
export async function itemListingUid(accountId: string, kind: ItemKind, itemId: string): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(`atlas-armarium-item\n${accountId}\n${kind}\n${itemId}`));
  return digest.slice(0, 32);
}
