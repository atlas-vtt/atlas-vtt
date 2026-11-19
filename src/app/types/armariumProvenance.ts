/**
 * Where an item installed from the Armarium came from, as its own file keeps it under `armarium`:
 * the listing's uid, the version installed and the fingerprint of the item as installed.
 */
export interface ArmariumProvenance {
  uid: string;
  version: number;
  installed: string;
}
