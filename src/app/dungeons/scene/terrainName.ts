import { t, type MessageKey } from '../../i18n';
import { en } from '../../i18n/locales/en';
import type { TerrainDrop } from '../model';

const isMessageKey = (key: string): key is MessageKey => Object.hasOwn(en, key);

/** A piece as its name reads it: its name's key and kind, and a cave's way up or down where it opens one. */
interface Named {
  name: string;
  kind: string;
  traits?: { drop?: TerrainDrop };
}

/** What a cave's way up or down is called with its depth: a shaft rising is an aven, a chimney and a vertical squeeze are what they are either way. */
function depthKey(piece: Named, drop: TerrainDrop): MessageKey {
  if (drop.kind === 'chimney') return 'dungeon.terrain.depth.chimney';
  if (drop.kind === 'squeeze') return 'dungeon.terrain.depth.squeeze';
  return piece.kind === 'aven' ? 'dungeon.terrain.depth.aven' : 'dungeon.terrain.depth.shaft';
}

/**
 * What a piece of terrain (or a kind of growth) is called, for the GM's note and hover label. The
 * piece names its text by an i18n key (`DungeonTerrain.name`, model data an export carries); a key
 * this version has no text for reads as the piece's kind. A cave's way up or down is named by how
 * it is passed, with its depth in feet ("Chimney, 20 ft").
 */
export function terrainName(piece: Named): string {
  const drop = piece.traits?.drop;
  if (drop) return t(depthKey(piece, drop), { depth: drop.depth });
  return isMessageKey(piece.name) ? t(piece.name) : piece.kind.replace(/-/g, ' ');
}
