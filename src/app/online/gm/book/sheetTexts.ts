import { bookText, MAX_ASSET_BYTES, MAX_SHEET_TEXT, TEXT_MIME_TYPE, type AssetRef, type SheetText } from '../../protocol/index.ts';
import { sha256Hex } from '../assetServe.ts';
import { openingOf } from './bookTexts.ts';

/** A text of a sheet as players fetch it whole: its reference, and the bytes it is served as. */
export interface SheetTextAsset {
  readonly ref: AssetRef;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** A text cut to what one asset holds, never inside a character of two units. */
const withinAsset = (text: string): string => (text.length > MAX_ASSET_BYTES ? text.slice(0, MAX_ASSET_BYTES).replace(/[\ud800-\udbff]$/, '') : text);

/**
 * The whole texts a drawn statblock names by hash. Hashing takes a promise, so a statblock is drawn
 * twice: the first time names every text longer than its opening (`wanted`), the texts are hashed
 * (`hashed`), and the second time each such text carries its reference. A text whose reference is
 * not known yet is sent as its opening alone.
 */
export class SheetTexts {
  readonly wanted = new Set<string>();

  constructor(private readonly refs: ReadonlyMap<string, AssetRef> = new Map()) {}

  /** A text as the sheet carries it: cleaned as a book's text, its opening cut at a word, and the whole text by hash where it is longer. */
  of(value: string): SheetText {
    const text = bookText(withinAsset(value), MAX_ASSET_BYTES) ?? '';
    const opening = openingOf(text, MAX_SHEET_TEXT);
    if (opening === text) return { opening };
    this.wanted.add(text);
    const whole = this.refs.get(text);
    return whole === undefined ? { opening } : { opening, whole };
  }

  /** The texts this drawing wanted whole, each hashed and ready to serve, by text; one of more than an asset holds is left out. */
  async hashed(): Promise<Map<string, SheetTextAsset>> {
    const assets = new Map<string, SheetTextAsset>();
    for (const text of this.wanted) {
      // A copy the hash can take: `encode` names no particular buffer type.
      const bytes = new TextEncoder().encode(text).slice();
      if (bytes.length > MAX_ASSET_BYTES) continue;
      assets.set(text, { ref: { hash: await sha256Hex(bytes), size: bytes.length, mime: TEXT_MIME_TYPE }, bytes });
    }
    return assets;
  }
}
