import type { WorldMaps } from './worldMap.ts';
import type { WorldMapSigns } from './worldMapSigns.ts';
import type { WorldMapFile } from './worldMapLevels.ts';

/**
 * The world map as each page is handed it: a page that said it draws the book's maps from their tile
 * pyramids (`book-parts` with `tiles`) gets them so, as it gets the table's map; any other page each
 * map as one image, which is made only while such a page is at the table and let go of once none is.
 */
export class WorldMapForms {
  private readonly tiled = new Set<string>();
  private tiles: WorldMapFile | null = null;
  /** The maps as images with their signs: undefined while they are being read, and while no page holds them. */
  private images: WorldMapFile | null | undefined;

  constructor(private readonly maps: WorldMaps, private readonly signs: WorldMapSigns) {}

  /** A page said it draws the book's maps from their pyramids: true where that is news. */
  drawsTiles(player: string): boolean {
    if (this.tiled.has(player)) return false;
    this.tiled.add(player);
    return true;
  }

  left(player: string): void {
    this.tiled.delete(player);
  }

  /**
   * Reads the world map in the forms the pages of the players `online` draw, and once every one of
   * them is read takes them with their signs (found as `found` says): the tile form, as read, or
   * undefined while a form is still being read, so a page gets what changed with its maps in one go.
   * The signs of the tile form are those a sign opened is looked up among: the image form leaves out
   * no map they hold. While no page draws images, what was made only for such pages is let go of.
   */
  read(online: ReadonlySet<string>, found: ReadonlyMap<string, string>): WorldMapFile | null | undefined {
    const tiles = this.maps.get('tiles');
    const imagePages = [...online].some((player) => !this.tiled.has(player));
    if (!imagePages) this.maps.releaseWhole();
    const images = imagePages ? this.maps.get('whole') : null;
    if (tiles === undefined || images === undefined) return undefined;
    this.images = imagePages ? this.signs.of(images, found) : undefined;
    this.tiles = this.signs.of(tiles, found);
    return tiles;
  }

  /** What `player` is handed: undefined while the maps in their page's form are being read. */
  of(player: string): WorldMapFile | null | undefined {
    return this.tiled.has(player) ? this.tiles : this.images;
  }
}
