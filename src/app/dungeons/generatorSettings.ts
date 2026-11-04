import { isRecord } from '../utils/guards';
import { floorCount } from './model';
import { DEFAULT_VIEW, GRID_STYLES, type DungeonView } from './style';
import { DEFAULT_STYLE_ID, isDungeonStyleId, type DungeonStyleId } from './styleCatalog';
import { readTags, type DungeonTag } from './tags';
import { readThemeChoice } from './themes/themes';
import type { ThemeChoice } from './themes/themeTypes';

/**
 * The GM's preferences for the dungeon generator, kept in Atlas' settings: the style dungeons are
 * drawn in, what they show, and what was asked for last (theme, tags, floors, the boss room and
 * five-room switches). Never a dungeon itself: that becomes a scene.
 */
export interface DungeonGeneratorSettings {
  /** The look picked in the gallery, by id. */
  style: DungeonStyleId;
  view: DungeonView;
  theme: ThemeChoice;
  tags: DungeonTag[];
  floors: number;
  bossRoom: boolean;
  fiveRoom: boolean;
}

export const DEFAULT_DUNGEON_GENERATOR_SETTINGS: DungeonGeneratorSettings = {
  style: DEFAULT_STYLE_ID,
  view: DEFAULT_VIEW,
  theme: 'any',
  tags: [],
  floors: 1,
  bossRoom: true,
  fiveRoom: false,
};

function oneOf<T extends string>(value: unknown, options: readonly T[], base: T): T {
  return options.includes(value as T) ? (value as T) : base;
}

function flag(value: unknown, base: boolean): boolean {
  return typeof value === 'boolean' ? value : base;
}

/** A view from stored data, over the defaults field by field; fields of older versions are left behind. */
export function readDungeonView(value: unknown, base: DungeonView = DEFAULT_VIEW): DungeonView {
  const record = isRecord(value) ? value : {};
  return {
    grid: oneOf(record.grid, GRID_STYLES, base.grid),
    smallTiles: flag(record.smallTiles, base.smallTiles),
    water: flag(record.water, base.water),
    props: flag(record.props, base.props),
    shadow: base.shadow,
    secrets: base.secrets,
    monochrome: flag(record.monochrome, base.monochrome),
  };
}

/**
 * The settings as stored, each field checked; whatever is unreadable takes its default. A style
 * Atlas does not know (a newer version's, or the colours an earlier build let the GM edit) is the
 * default style. A theme it does not know is Any, and the tags that once chose a theme (temple, tomb,
 * dwelling) are dropped.
 */
export function readDungeonGeneratorSettings(stored: unknown): DungeonGeneratorSettings {
  const record = isRecord(stored) ? stored : {};
  return {
    style: isDungeonStyleId(record.style) ? record.style : DEFAULT_STYLE_ID,
    view: readDungeonView(record.view),
    theme: readThemeChoice(record.theme),
    tags: Array.isArray(record.tags) ? readTags(record.tags.filter((tag): tag is string => typeof tag === 'string')) : [],
    floors: floorCount(record.floors),
    bossRoom: flag(record.bossRoom, true),
    fiveRoom: flag(record.fiveRoom, false),
  };
}
