import { sha256Hex } from '../assetServe.ts';
import type { VaultImage } from '../TokenShare.ts';
import { AskedAnswer } from './askedAnswer.ts';
import { MapImages, type FileStat, type MapImage, type MapImageProblem } from './mapImages.ts';
import type { WorldMapTree } from './worldMapGate.ts';
import { worldMapOf, type WorldMapFile } from './worldMapLevels.ts';

export type { FileStat, MapImageProblem } from './mapImages.ts';
export type { WorldMapFile } from './worldMapLevels.ts';
export type { WorldMapTree } from './worldMapGate.ts';

export interface WorldMapPorts {
  /** The file at a vault path as it is now, or null when there is none. */
  stat(path: string): FileStat | null;
  /** The image at a vault path, or null when it is missing or of a type players cannot be sent. */
  readImage(path: string): Promise<VaultImage | null>;
  /** The world map that may be shown now with the maps it leads into, or null: Atlas answers from the campaign being played. */
  source(): Promise<WorldMapTree | null>;
  /** A map that was being looked up or read is known now. */
  read(): void;
}

/** What the GM is told when the world map's image cannot be sent to players. */
export const WORLD_MAP_PROBLEM_TEXT: Readonly<Record<MapImageProblem, string>> = {
  missing: 'Atlas Online cannot send the world map: its image file is missing.',
  'too-large': 'Atlas Online cannot send the world map: its image is larger than 64 MB.',
  unreadable: 'Atlas Online cannot send the world map: its image is not a PNG, JPEG, WebP, GIF or AVIF that players can open.',
};

/** The tree Atlas answered, with the id players know each of its maps by. */
interface NamedTree {
  readonly tree: WorldMapTree;
  readonly ids: ReadonlyMap<string, string>;
}

/** The id players know a map by: made from its asset id, so it stays while the map does and says nothing of it. */
async function mapId(key: string): Promise<string> {
  return (await sha256Hex(new Uint8Array(new TextEncoder().encode(`atlas-book-map\n${key}`)))).slice(0, 24);
}

async function named(tree: WorldMapTree | null): Promise<NamedTree | null> {
  if (tree === null) return null;
  const ids = new Map(await Promise.all(tree.levels.map(async (level) => [level.key, await mapId(level.key)] as const)));
  return { tree, ids };
}

/**
 * The campaign's world map as players are sent it, with every map its GM's pins lead into: each
 * image by hash with its size in pixels (`MapImages`). Which maps they are is asked once and again
 * after `forget`; an image is read once and kept while its file stays as it is.
 */
export class WorldMaps {
  private readonly tree: AskedAnswer<NamedTree | null>;
  private readonly images: MapImages;

  constructor(ports: WorldMapPorts) {
    this.tree = new AskedAnswer(async () => named(await ports.source()), null, () => ports.read());
    this.images = new MapImages({ stat: (path) => ports.stat(path), readImage: (path) => ports.readImage(path), read: () => ports.read() });
  }

  /** The world map: null for none, undefined while it is being looked up or read (`read` hears when it has been). */
  get(): WorldMapFile | null | undefined {
    const asked = this.tree.get();
    if (asked === undefined) return undefined;
    if (asked === null) return null;
    const paths = new Set(asked.tree.levels.map((level) => level.image));
    this.images.keepOnly(paths);
    const images = new Map<string, MapImage | null>();
    let reading = false;
    for (const path of paths) {
      const image = this.images.get(path);
      if (image === undefined) reading = true;
      else images.set(path, image);
    }
    return reading ? undefined : worldMapOf(asked.tree, asked.ids, images);
  }

  /**
   * Why the world map's own image cannot be sent, or null where it can, none is chosen, or it is
   * still being read: the maps it leads into are left out without a word, the world map never.
   */
  problem(): MapImageProblem | null {
    const asked = this.tree.get();
    const root = asked?.tree.levels.find((level) => level.key === asked.tree.root);
    return root === undefined ? null : this.images.problemOf(root.image);
  }

  /** Asks again which maps are shown: the campaign, its world map, a scene's pins or a map's artwork may be another now. A file already read is not read again. */
  forget(): void {
    this.tree.forget();
  }
}
