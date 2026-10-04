import { isRecord } from 'src/app/services/assetMetadataGuards';
import type { CalendarDefinition } from './calendar/calendarDefinition';
import { normalizeWorldDate } from './calendar/worldDate';
import { spanOf, spansOverlap, type DateBounds, type DaySpan } from './dating/dateRange';

/** A scene background valid only in a period (a map of the region in another era). */
export interface MapVariant extends DateBounds {
  id: string;
  name?: string;
  /** Vault path of the image. */
  background: string;
}

/**
 * World-time data a scene saves in its `.atlasmap` file under `worldTime`.
 * Every field is optional, so scenes from upstream Atlas load unchanged and
 * upstream Atlas ignores the field.
 */
export interface SceneWorldTime {
  /** The date the scene shows; absent = the global default date, or no filtering. */
  viewingDate?: string;
  /** Slider bounds the GM fixed; absent ends follow the dated objects and events. */
  rangeStart?: string;
  rangeEnd?: string;
  variants?: MapVariant[];
}

function readDate(value: unknown): string | undefined {
  return normalizeWorldDate(value) ?? undefined;
}

function readVariant(value: unknown): MapVariant | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.background !== 'string' || value.background === '') return null;
  const from = readDate(value.from);
  const to = readDate(value.to);
  const name = typeof value.name === 'string' && value.name.trim() !== '' ? value.name : undefined;
  return {
    id: value.id,
    background: value.background,
    ...(name !== undefined ? { name } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
}

/** Trust boundary for the `worldTime` field of a map file. */
export function readSceneWorldTime(value: unknown): SceneWorldTime {
  if (!isRecord(value)) return {};
  const viewingDate = readDate(value.viewingDate);
  const rangeStart = readDate(value.rangeStart);
  const rangeEnd = readDate(value.rangeEnd);
  const variants = Array.isArray(value.variants)
    ? value.variants.map(readVariant).filter((variant): variant is MapVariant => variant !== null)
    : [];
  return {
    ...(viewingDate !== undefined ? { viewingDate } : {}),
    ...(rangeStart !== undefined ? { rangeStart } : {}),
    ...(rangeEnd !== undefined ? { rangeEnd } : {}),
    ...(variants.length > 0 ? { variants } : {}),
  };
}

/** A background candidate: a scene variant or a `type: map-variant` note. */
export interface BackgroundCandidate extends DateBounds {
  background: string;
}

/**
 * The background to show at the viewing date: the dated variant covering it
 * (the one that began last when several do), else the scene's own background.
 * Undated variants are never picked automatically.
 */
export function pickBackground(
  calendar: CalendarDefinition,
  base: string | null,
  candidates: readonly BackgroundCandidate[],
  viewing: DaySpan | null,
): string | null {
  if (!viewing) return base;
  let best: { background: string; start: number } | null = null;
  for (const candidate of candidates) {
    const span = spanOf(calendar, candidate);
    if (!span || !spansOverlap(span, viewing)) continue;
    if (!best || span.start > best.start) best = { background: candidate.background, start: span.start };
  }
  return best?.background ?? base;
}
