import type { BookNestedMap, MapSign } from '../../protocol/index.ts';
import { foundPinKey } from '../pins/foundPinKey.ts';
import type { WorldMapSign } from './worldMapGate.ts';
import type { WorldMapFile } from './worldMapLevels.ts';

/**
 * The readable pins of the world map as players are sent them: each on its map under an alias of its
 * own that stays while the table runs, with its face and the log entry that tells who found it, and
 * nothing of its note, as the table shares a readable pin (`ReadablePins`). The world map shows its
 * whole image, so all of them are shown. A sign players open is found through `sign`, which knows
 * only the signs last handed out.
 */
export class WorldMapSigns {
  private readonly aliases = new Map<string, string>();
  private shown = new Map<string, WorldMapSign>();

  constructor(private readonly randomId: () => string) {}

  /** The world map with its signs, each found as `found` says (by `foundPinKey`); `file` itself where it has none. */
  of(file: WorldMapFile | null, found: ReadonlyMap<string, string>): WorldMapFile | null {
    this.shown = new Map();
    if (file === null || file.signs.length === 0) return file;
    const byMap = new Map<string | undefined, MapSign[]>();
    for (const { on, x, y, sign } of file.signs) {
      const id = this.alias(sign);
      this.shown.set(id, sign);
      const shown: MapSign = { id, x, y, ...(sign.icon !== undefined && { icon: sign.icon }), ...(sign.label !== undefined && { label: sign.label }), found: found.get(foundPinKey(sign.map, sign.pin)) ?? null };
      const onMap = byMap.get(on);
      if (onMap === undefined) byMap.set(on, [shown]);
      else onMap.push(shown);
    }
    const signed = (map: BookNestedMap): BookNestedMap => {
      const signs = byMap.get(map.id);
      return signs === undefined ? map : { ...map, signs };
    };
    const root = byMap.get(undefined);
    const maps = file.map.maps?.map(signed);
    return { ...file, map: { ...file.map, ...(maps !== undefined && { maps }), ...(root !== undefined && { signs: root }) } };
  }

  /** The GM's pin players know as `alias`, among the signs last handed out; null for any other. */
  sign(alias: string): WorldMapSign | null {
    return this.shown.get(alias) ?? null;
  }

  private alias(sign: WorldMapSign): string {
    const key = foundPinKey(sign.map, sign.pin);
    let alias = this.aliases.get(key);
    if (alias === undefined) {
      alias = this.randomId();
      this.aliases.set(key, alias);
    }
    return alias;
  }
}
