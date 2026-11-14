import type { FogCoverage } from '../../fog/fogCoverage';
import { levelObjects } from '../../levels/levelObjects';
import { levelExploredMask } from '../../levels/sceneLevels';
import { exploredMemoryOn, tokenVisionOn } from '../../lighting/sceneLightingOptions';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { SceneState } from './atlasView.ts';
import { rememberedAt, type MaskAlpha, type MaskDecoder } from './exploredMaskAlpha.ts';
import { KnownOnMap, type KnownPlaces } from './knownOnMap.ts';
import { onMapAnnotations, toldAnnotationLists, type ToldAnnotationLists } from './mapLayerInputs.ts';
import type { MapSize } from './moveCheck.ts';
import { SentOrders } from './sentOrders.ts';

/** The shortest time between two readings of the saved explored memory. */
export const MEMORY_READ_MS = 5_000;

export interface AnnotationTellingPorts {
  now(): number;
  /** The size of the floor's map, which the players' memory lies over; null while it is unknown. */
  map(): MapSize | null;
  /** Reads a saved explored memory; without it nothing on the map is known by memory, only by sight. */
  readonly decodeMask?: MaskDecoder | undefined;
  /** What players know may be more now (a memory was read): the lists are to be worked out again. */
  changed(): void;
}

/** What the drawings and texts were last worked out from. */
interface AnnotationKey {
  readonly drawings: unknown;
  readonly texts: unknown;
  readonly fog: FogCoverage | null;
  /** Which of those on the map players know: the count of `KnownOnMap`, or null where all are known. */
  readonly known: number | null;
}

/**
 * What the players of one floor are told of its drawings and texts (`toldAnnotationLists`), with
 * what that takes beside the scene: the numbers their places in the order are told by
 * (`SentOrders`), and which of those on the map players know of (`KnownOnMap`), by their sight
 * now and by the explored memory the GM last saved.
 */
export class AnnotationTelling {
  private told: { readonly key: AnnotationKey; readonly value: ToldAnnotationLists } | null = null;
  private readonly orders = { above: new SentOrders(), onMap: new SentOrders() };
  private readonly known = new KnownOnMap();
  /** The explored memory last read, and the saved one it was read from; the one being read now; when a reading last began. */
  private memory: { readonly source: string; readonly alpha: MaskAlpha } | null = null;
  private reading: string | null = null;
  private readAt = Number.NEGATIVE_INFINITY;
  /** The scene told of last, and a count of the scenes, so a memory read for one is not taken for the next. */
  private sceneId: string | null = null;
  private scene = 0;

  constructor(private readonly ports: AnnotationTellingPorts) {}

  /** Whether the last look left drawings on the map unasked: whoever asks should ask again soon. */
  get pending(): boolean {
    return this.known.pending;
  }

  /**
   * The scene the lists are told of; null while none is. Another scene knows nothing of the last:
   * nothing is known, numbered or remembered. The same scene shared again (its files were handed
   * anew) keeps what players know of it, so nothing on its map is taken from them and told again.
   */
  setScene(id: string | null): void {
    this.told = null;
    if (id === null || id === this.sceneId) return;
    this.sceneId = id;
    this.orders.above.clear();
    this.orders.onMap.clear();
    this.known.clear();
    this.memory = null;
    this.reading = null;
    this.scene += 1;
  }

  /** The lists, worked out again only when the drawings, the texts, the fog or what players know of those on the map changed. `lit`: players see the scene lit. */
  lists(state: SceneState, fog: FogCoverage | null, lit: boolean, source: MapLayerSource): ToldAnnotationLists {
    const gated = this.learn(state, fog, lit, source);
    const { drawings, texts } = levelObjects(state);
    const key: AnnotationKey = { drawings, texts, fog, known: gated ? this.known.version : null };
    const last = this.told;
    if (last !== null && last.key.drawings === key.drawings && last.key.texts === key.texts && last.key.fog === key.fog && last.key.known === key.known) return last.value;
    const value = toldAnnotationLists(drawings, texts, fog, { orders: this.orders, ...(gated && { known: (annotation) => this.known.knows(annotation) }) });
    this.told = { key, value };
    return value;
  }

  /**
   * Takes in which drawings and texts on the map the players know now, where they see the map by
   * their tokens' sight: a lit scene with token vision on. False for any other scene, where
   * everything on the map is known that fog does not cover. Sight that cannot be read teaches
   * nothing; what was known stays known.
   */
  private learn(state: SceneState, fog: FogCoverage | null, lit: boolean, source: MapLayerSource): boolean {
    if (!lit || !tokenVisionOn(state.lighting)) return false;
    const { drawings, texts } = levelObjects(state);
    // Fog that cannot be read tells nothing at all just now: what is known waits for it.
    if (fog === null) return true;
    const onMap = onMapAnnotations(drawings, texts);
    const sight = source.sightParts?.();
    const places: KnownPlaces = { seen: (points) => source.pointsSeen(points, fog), ...(sight !== undefined && sight !== null && { sight }), memory: this.memoryOf(state) };
    this.known.look(onMap, [drawings, texts, fog], places);
    if (onMap.some((annotation) => !this.known.knows(annotation))) this.readMemory(state);
    return true;
  }

  /** The players' memory of the floor as it was last read, where the scene keeps one and the map's size is known. */
  private memoryOf(state: SceneState): KnownPlaces['memory'] {
    const map = this.ports.map();
    const memory = this.memory;
    if (memory === null || map === null || !exploredMemoryOn(state.lighting)) return undefined;
    return { key: memory.alpha, holds: (point) => rememberedAt(memory.alpha, map, point.x, point.y) };
  }

  /** Reads the saved explored memory where it is another than the one last read: one at a time, one every `MEMORY_READ_MS` at most, and only while something on the map waits to be known. */
  private readMemory(state: SceneState): void {
    const mask = levelExploredMask(state);
    const decode = this.ports.decodeMask;
    const now = this.ports.now();
    if (mask === null || decode === undefined || !exploredMemoryOn(state.lighting) || mask === this.memory?.source || this.reading !== null) return;
    if (now - this.readAt < MEMORY_READ_MS) return;
    this.reading = mask;
    this.readAt = now;
    const { scene } = this;
    const done = (alpha: MaskAlpha | null): void => {
      if (this.scene !== scene) return;
      this.reading = null;
      if (alpha === null) return;
      this.memory = { source: mask, alpha };
      this.ports.changed();
    };
    void decode(mask).then(done, () => done(null));
  }
}
