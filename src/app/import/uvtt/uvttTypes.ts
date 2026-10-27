/**
 * Universal VTT maps (`.dd2vtt`, `.uvtt`, `.df2vtt`) as Dungeondraft, DungeonFog and Dungeon
 * Alchemist export them: one JSON file holding the map image and its walls, doors and lights.
 * Every position in the file is counted in grid cells.
 */

export const UVTT_EXTENSIONS = ['dd2vtt', 'uvtt', 'df2vtt'] as const;

/** What an import accepts; a file beyond any of these is refused with the reason. */
export const UVTT_LIMITS = {
  /** Exports with a large JPEG reach 30 MB; the same map as PNG is several times that. */
  fileBytes: 150 * 1024 * 1024,
  /** Wall segments and doors together. */
  wallSegments: 20_000,
  lights: 2_000,
  /** Cells along one side of the map, and at least one. */
  mapCells: 4_096,
  /** Pixels of the image a cell spans at least; smaller cells hold no token and a grid of them no map. */
  cellPixels: 10,
  /**
   * Largest coordinate of a position and longest range of a light, in cells. It only keeps the
   * numbers plain to reckon with: what lies beyond the map is cut off or left out (`placeableRect`).
   */
  distance: 1_000_000,
  /**
   * Pixels of the map image: what the image workers' memory budget holds decoded, at four bytes a
   * pixel (`MEMORY_BUDGET_BYTES`, 1 GiB). As many as a square of 16,384 pixels, in any shape.
   */
  imagePixels: 268_435_456,
  /** Files imported together as the floors of one scene. */
  floors: 32,
  /**
   * All files of one scene together: their images are held as the files hold them until each is
   * converted. Wall segments, doors and lights count against the limits above for all floors
   * together too, since the scene holds every floor's.
   */
  floorsBytes: 400 * 1024 * 1024,
} as const;

export interface UvttPoint {
  x: number;
  y: number;
}

/** A door (closed) or a window (not closed): `bounds` are its two ends. */
export interface UvttPortal {
  bounds: [UvttPoint, UvttPoint];
  closed: boolean;
}

export interface UvttLight {
  position: UvttPoint;
  /** How far the light reaches, in cells. */
  range: number;
  intensity: number;
  /** `#rrggbb`. */
  color: string;
}

export type UvttImageType = 'image/png' | 'image/webp' | 'image/jpeg';

export interface UvttImage {
  bytes: Uint8Array<ArrayBuffer>;
  /** Read from the image's own header, never from what the file claims. */
  type: UvttImageType;
}

/** A file's content once every field is checked. */
export interface UvttMap {
  /** The cell at the image's top-left corner. */
  origin: UvttPoint;
  /** Cells the image spans. */
  size: UvttPoint;
  image: UvttImage;
  /** Wall lines and the outlines of objects that block sight; each runs through its points in order. */
  polylines: UvttPoint[][];
  portals: UvttPortal[];
  lights: UvttLight[];
  /** `#rrggbb`, or null when the file names none. */
  ambientLight: string | null;
  /** The image already shows the lights' glow. */
  bakedLighting: boolean;
}

/** `problem` says in plain words why the file is refused. */
export interface UvttRefusal {
  ok: false;
  problem: string;
}

export type UvttParseResult = { ok: true; map: UvttMap } | UvttRefusal;
