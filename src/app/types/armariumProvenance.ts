/**
 * Where an item installed from the Armarium came from, as its own file keeps it under `armarium`:
 * the listing's uid, the version installed, the item's id in the bundle it came from and the
 * fingerprint of the item as installed.
 */
export interface ArmariumProvenance {
  uid: string;
  version: number;
  /** The item's id in the publisher's bundle; an update must carry the same id, or it is another item claiming the listing. */
  source: string;
  installed: string;
}
