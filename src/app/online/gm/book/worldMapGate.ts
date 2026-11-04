import type { MapStretch } from '../../../grid/mapStretch';
import { gateSlot } from './gateSlot.ts';

/** A way from one map of the world map into another, where the GM's pin stands: a point of the scene's world. */
export interface WorldMapEntrance {
  readonly x: number;
  readonly y: number;
  /** The key of the map it opens (`WorldMapLevel.key`). */
  readonly to: string;
  /** The face of the GM's pin (`sentPinFace`): players see the pin the GM placed. */
  readonly icon?: string;
  readonly label?: string;
}

/** A quest the GM's pin places, where the pin stands: a point of the scene's world. */
export interface WorldMapQuest {
  readonly x: number;
  readonly y: number;
  /** The quest's id (`atlas-id` of its note). */
  readonly id: string;
}

/** One map players may be shown: the world map, or a map its pins lead into. */
export interface WorldMapLevel {
  /** The map's or scene's asset id. It is never sent. */
  readonly key: string;
  readonly title: string;
  /** The vault path of its image. */
  readonly image: string;
  /** How its scene draws the image, whose world its entrances stand in; a map without a scene draws it as it is. */
  readonly stretch: MapStretch;
  readonly entrances: readonly WorldMapEntrance[];
  /** The quests its pins place, by the pins that link their notes; none where no pin links a quest. */
  readonly quests?: readonly WorldMapQuest[];
}

/** The world map and every map its pins lead into, however deep: `root` is the key of the world map, `levels` hold it first and each map once. */
export interface WorldMapTree {
  readonly root: string;
  readonly levels: readonly WorldMapLevel[];
}

/** Answers which maps players may be shown as the world map, and says when that may have changed. */
export interface WorldMapGate {
  /** The world map players may be shown now with the maps it leads into, or null for none. */
  worldMap(): Promise<WorldMapTree | null>;
  /** Calls `listener` whenever the world map may be another; returns what stops it. */
  onChange(listener: () => void): () => void;
}

const slot = gateSlot<WorldMapTree | null>(null);

/**
 * Names who decides which images are the world map and the maps it leads into. Campaign files and
 * scenes are data too (a sync tool or a hand edit may have written them), and the images go to other
 * people: Atlas answers from the campaign being played and its own asset index. Without a gate no
 * image is shown.
 */
export function setWorldMapGate(next: WorldMapGate | null): void {
  slot.set(next === null ? null : { read: () => next.worldMap(), onChange: (listener) => next.onChange(listener) });
}

/** The world map players may be shown now with the maps it leads into, or null for none. */
export const gatedWorldMap = (): Promise<WorldMapTree | null> => slot.read();

/** Calls `listener` whenever the world map may be another, also when the gate itself changes. */
export const onWorldMapChange = (listener: () => void): (() => void) => slot.onChange(listener);
