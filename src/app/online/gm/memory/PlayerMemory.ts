import type { SceneLighting } from '../../../types/lightingTypes';
import { exploredShapes, type ExploredShapes } from '../../../vision/exploredShapes';
import type { AmbientLight, LightReach, SightRegion } from '../../../vision/sight';
import { toBase64 } from '../assetServe.ts';
import type { PartyLighting } from '../eyesSight.ts';
import type { MemoryPng, MemoryRaster } from './memoryPorts.ts';

/** What the last stamp was worked out from: the same again records nothing new. */
interface StampInputs {
  readonly all: boolean;
  readonly regions: readonly SightRegion[];
  readonly reaches: readonly LightReach[];
  readonly ambient: AmbientLight;
  readonly memoryOn: boolean | undefined;
}

const sameItems = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((item, index) => item === b[index]);

const sameAmbient = (a: AmbientLight, b: AmbientLight): boolean => a === b
  || (a.ambient === b.ambient && a.litThreshold === b.litThreshold && a.brightThreshold === b.brightThreshold && sameItems(a.zones ?? [], b.zones ?? []));

/** What a player's memory records of what they see now (`seen`): the shapes `exploredShapes` makes of it, or null for none. */
export type ShapesOf = (seen: PartyLighting, lighting: Pick<SceneLighting, 'exploredMemory'>) => ExploredShapes | null;

/** The shapes the party's own memory records of the same sight. */
export const recordedShapes: ShapesOf = ({ sight, ambient, reaches }, lighting) =>
  exploredShapes(sight, { ...ambient, ...(lighting.exploredMemory !== undefined && { exploredMemory: lighting.exploredMemory }) }, reaches);

const sameInputs = (a: StampInputs, b: StampInputs): boolean => a.all === b.all && a.memoryOn === b.memoryOn && sameAmbient(a.ambient, b.ambient)
  && sameItems(a.regions, b.regions) && sameItems(a.reaches, b.reaches);

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

/**
 * One player's explored memory of one floor, as Foundry keeps a fog exploration per user and scene: only
 * what that player's own eyes saw, stamped into a texture of the GM's own memory's kind, and read back as
 * a PNG (`saved`) for the player and the store. It starts from what the store kept (`load`); stamps that
 * come first are kept, since a merge keeps the larger coverage of each texel.
 */
export class PlayerMemory {
  private savedPng: MemoryPng | null = null;
  /** The memory the store was last given or read from. */
  private written: MemoryPng | null = null;
  private url: { readonly png: MemoryPng; readonly text: string } | null = null;
  private stamped: StampInputs | null = null;
  /** Something was stamped since the memory was last read back. */
  private dirty = false;
  private loaded = false;

  /** `raster`: null where the GM has no graphics device: the memory is then what the store kept. */
  constructor(private readonly raster: MemoryRaster | null) {}

  /** Whether the store was read, so `saved` is the player's memory. */
  get ready(): boolean {
    return this.loaded;
  }

  /** The memory as last read back or taken from the store; null for none. */
  get saved(): MemoryPng | null {
    return this.savedPng;
  }

  /** Whether the store holds another memory than `saved`. */
  get unwritten(): boolean {
    return this.savedPng !== this.written;
  }

  /** Whether something was stamped since the memory was last read back. */
  get stale(): boolean {
    return this.dirty;
  }

  /** Records what the player sees now (`seen`, as `shapesOf` makes it shapes), unless it is what the last stamp was worked out from. */
  record(seen: PartyLighting, lighting: Pick<SceneLighting, 'exploredMemory'>, shapesOf: ShapesOf = recordedShapes): void {
    if (this.raster === null) return;
    const { sight, ambient, reaches } = seen;
    const inputs: StampInputs = { all: sight.all, regions: sight.regions, reaches, ambient, memoryOn: lighting.exploredMemory };
    if (this.stamped !== null && sameInputs(this.stamped, inputs)) return;
    this.stamped = inputs;
    const shapes = shapesOf(seen, lighting);
    if (shapes === null) return;
    try {
      this.raster.add(shapes);
      this.dirty = true;
    } catch (error) {
      console.error('Atlas: could not record what a player explored', error);
    }
  }

  /** Takes in what the store kept (null: none); one the texture cannot read counts as none. */
  async load(png: MemoryPng | null): Promise<void> {
    let kept = png;
    if (kept !== null && this.raster !== null) {
      try {
        await this.raster.merge(kept);
      } catch {
        kept = null;
      }
    }
    this.savedPng = kept;
    this.written = kept;
    this.loaded = true;
  }

  /** Reads the memory back where something was stamped since; whether the player's memory changed. */
  async encode(): Promise<boolean> {
    if (!this.dirty || this.raster === null || !this.loaded) return false;
    this.dirty = false;
    const png = await this.raster.encode().catch((error: unknown) => {
      console.error('Atlas: could not read back what a player explored', error);
      return null;
    });
    // The texture cannot be read now: what was stamped is read back later.
    if (png === null) {
      this.dirty = true;
      return false;
    }
    if (this.savedPng !== null && sameBytes(png, this.savedPng)) return false;
    this.savedPng = png;
    return true;
  }

  /**
   * Makes the memory what `change` gives of it as it is now, with what was stamped since: what remains of a
   * removal by the GM. What the player sees then is recorded again at the next stamp.
   */
  async change(change: (png: MemoryPng | null) => Promise<MemoryPng | null>): Promise<void> {
    if (this.raster !== null && this.dirty) {
      this.dirty = false;
      this.savedPng = (await this.raster.encode()) ?? this.savedPng;
    }
    const next = await change(this.savedPng);
    await this.raster?.replace(next);
    this.savedPng = next;
    this.stamped = null;
  }

  /** Takes what the store holds now in place of what the texture held (`png`, null: none): the store's files were changed elsewhere. */
  async reload(png: MemoryPng | null): Promise<void> {
    let kept = png;
    try {
      await this.raster?.replace(kept);
    } catch {
      kept = null;
      await this.raster?.replace(null);
    }
    this.savedPng = kept;
    this.written = kept;
    this.stamped = null;
    this.dirty = false;
  }

  /** The store was given `png`. */
  wrote(png: MemoryPng | null): void {
    this.written = png;
  }

  /** The saved memory as a data URL, made once per save; null for none. */
  dataUrl(): string | null {
    const png = this.savedPng;
    if (png === null) return null;
    if (this.url?.png !== png) this.url = { png, text: `data:image/png;base64,${toBase64(png)}` };
    return this.url.text;
  }

  destroy(): void {
    this.raster?.destroy();
  }
}
