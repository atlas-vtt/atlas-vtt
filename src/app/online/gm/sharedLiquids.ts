import { isLiquidArea, liquidCorners, MAX_SHARED_LIQUID_TOTAL, type SharedLiquid } from '../protocol/index.ts';
import { liquidList } from '../../liquids/liquids';
import type { LiquidSurface } from '../../types/liquidTypes';
import { roundPlace } from './scenePicture.ts';

type Corners = readonly { readonly x: number; readonly y: number }[];

/** Corners as players are sent them: flat, to a hundredth of a world pixel. */
const flat = (corners: Corners): number[] => corners.flatMap(({ x, y }) => [roundPlace(x), roundPlace(y)]);

/**
 * The water, lava and acid of a floor as players are sent them: what `liquidList` reads of the floor's
 * record, in its order, each surface under an alias kept while the scene stands, and the light a lava
 * glows with under an alias too, so no id of the GM's scene leaves. Worked out again only when the
 * record changes; the same list for the same record.
 */
export class SharedLiquids {
  private readonly aliases = new Map<string, string>();
  private readonly glows = new Map<string, string>();
  private last: { readonly record: unknown; readonly liquids: readonly SharedLiquid[] } | null = null;

  constructor(private readonly randomId: () => string) {}

  /** A new scene: its surfaces get aliases of their own. */
  clear(): void {
    this.aliases.clear();
    this.glows.clear();
    this.last = null;
  }

  /** The surfaces of a floor's record (`levelObjects(state).liquids`), as long as all corners stay within `MAX_SHARED_LIQUID_TOTAL`. */
  of(record: Record<string, LiquidSurface> | undefined): readonly SharedLiquid[] {
    if (this.last !== null && this.last.record === record) return this.last.liquids;
    const liquids: SharedLiquid[] = [];
    let total = 0;
    for (const surface of liquidList(record)) {
      const liquid = this.shared(surface);
      if (liquid === null) continue;
      total += liquidCorners(liquid);
      if (total > MAX_SHARED_LIQUID_TOTAL) break;
      liquids.push(liquid);
    }
    this.last = { record, liquids };
    return liquids;
  }

  /** A surface as players get it, or null for one whose corners, rounded, lie off the map or enclose no area. */
  private shared(surface: LiquidSurface): SharedLiquid | null {
    const polygon = flat(surface.polygon);
    if (!isLiquidArea(polygon)) return null;
    const holes = (surface.holes ?? []).map(flat).filter(isLiquidArea);
    return {
      id: this.alias(this.aliases, surface.id),
      liquid: surface.liquid,
      polygon,
      ...(holes.length > 0 && { holes }),
      ...(surface.flow !== undefined && { flow: { x: surface.flow.x, y: surface.flow.y } }),
      colours: { surface: surface.colors.surface, deep: surface.colors.deep, glint: surface.colors.glint },
      ...(surface.art === 'engraved' && { art: 'engraved' as const }),
      ...(surface.liquid === 'lava' && surface.lavaLight !== undefined && { glow: this.alias(this.glows, surface.lavaLight) }),
    };
  }

  private alias(aliases: Map<string, string>, id: string): string {
    const known = aliases.get(id);
    if (known !== undefined) return known;
    const alias = this.randomId();
    aliases.set(id, alias);
    return alias;
  }
}
