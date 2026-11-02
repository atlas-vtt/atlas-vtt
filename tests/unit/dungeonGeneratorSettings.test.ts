// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { applyDungeonEdits, NO_EDITS, withWingHidden } from '../../src/app/dungeons/edits';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { dungeonWalls } from '../../src/app/dungeons/scene/toWalls';
import { secretWingOf } from '../../src/app/dungeons/secretWings';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { DEFAULT_DUNGEON_GENERATOR_SETTINGS, readDungeonGeneratorSettings } from '../../src/app/dungeons/generatorSettings';
import { parseHex } from '../../src/app/dungeons/render/palette';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { DEFAULT_STYLE_ID, DUNGEON_STYLES, dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { readStoredSettings } from '../../src/app/services/atlasSettings';
import { SettingsService } from '../../src/app/services/SettingsService';

describe('reading the generator settings', () => {
  it('gives the defaults for nothing stored', () => {
    expect(readDungeonGeneratorSettings(undefined)).toEqual(DEFAULT_DUNGEON_GENERATOR_SETTINGS);
    expect(readStoredSettings({}, 'mouse').settings.dungeonGenerator).toEqual(DEFAULT_DUNGEON_GENERATOR_SETTINGS);
  });

  it('keeps a style it knows and drops what it cannot read', () => {
    const read = readDungeonGeneratorSettings({
      style: 'night',
      view: { grid: 'hexes', water: false, notes: 'boxes', titleAndStory: true, rotateToFit: false },
      tags: ['small', 'large', 'unknown', 7],
    });
    expect(read.style).toBe('night');
    // Fields of the page the generator once drew are left behind
    expect(read.view).toEqual({ ...DEFAULT_VIEW, water: false });
    // Rivals resolve in order: the later size wins
    expect(read.tags).toEqual(['large']);
  });

  it('reads a style it does not know, or the colours an earlier build stored, as the default style', () => {
    expect(readDungeonGeneratorSettings({ style: 'neon' }).style).toBe(DEFAULT_STYLE_ID);
    const earlier = readDungeonGeneratorSettings({ preset: 'custom', style: { colors: { ink: '#123456' }, strokes: { thick: 9 } } });
    expect(earlier.style).toBe(DEFAULT_STYLE_ID);
    expect(earlier).not.toHaveProperty('preset');
  });

  it('keeps what the GM chose in Atlas settings', () => {
    const settings = new SettingsService({} as App);
    settings.setDungeonGenerator({ view: { ...DEFAULT_VIEW, monochrome: true }, theme: 'cavern', tags: ['wet'], style: 'blueprint', floors: 3, bossRoom: false, fiveRoom: true });
    expect(settings.getDungeonGenerator()).toEqual({ view: { ...DEFAULT_VIEW, monochrome: true }, theme: 'cavern', tags: ['wet'], style: 'blueprint', floors: 3, bossRoom: false, fiveRoom: true });
  });

  it('reads retired theme tags and an unknown theme as Any', () => {
    expect(readDungeonGeneratorSettings({ tags: ['tomb', 'wet'], theme: 'temple' })).toMatchObject({ theme: 'any', tags: ['wet'] });
    expect(readDungeonGeneratorSettings({ theme: 'fortress' }).theme).toBe('fortress');
    expect(readDungeonGeneratorSettings({}).theme).toBe('any');
  });

  it('reads floors and the switches from stored data, defaults where they are missing or broken', () => {
    expect(readDungeonGeneratorSettings({})).toMatchObject({ floors: 1, bossRoom: true, fiveRoom: false });
    expect(readDungeonGeneratorSettings({ floors: 9, bossRoom: 'yes', fiveRoom: true })).toMatchObject({ floors: 4, bossRoom: true, fiveRoom: true });
  });
});

describe('the style catalog', () => {
  it('has distinct ids and a style for every id, the default first', () => {
    const ids = DUNGEON_STYLES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(DEFAULT_STYLE_ID);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(dungeonStyle('nothing')).toBe(dungeonStyle(DEFAULT_STYLE_ID));
  });

  it('keeps the ink far from the floor in every style, so walls read under tokens', () => {
    const luminance = (hex: string): number => {
      const [r, g, b] = parseHex(hex);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const { id, style } of DUNGEON_STYLES) {
      const { ink, floor } = style.colors;
      expect(Math.abs(luminance(ink) - luminance(floor)), id).toBeGreaterThan(90);
    }
  });
});

describe('the GM’s edits on a dungeon', () => {
  it('leave the dungeon as it is when there are none', () => {
    const model = generateDungeon({ seed: 4242, tags: ['medium'], floors: 1 });
    expect(applyDungeonEdits(model, NO_EDITS)).toBe(model);
  });
});

describe('hiding one secret wing', () => {
  type Model = ReturnType<typeof generateDungeon>;
  /** The secret wings of floor `index`, by their first rooms. */
  const wingsOf = (m: Model, index: number): number[] => {
    const rooms = m.floors[index]?.rooms ?? [];
    return [...new Set(rooms.flatMap((room) => secretWingOf(rooms, room.id) ?? []))];
  };
  const request = (seed: number): Parameters<typeof generateDungeon>[0] => ({ seed, tags: ['secret'], floors: 2 });
  const seed = Array.from({ length: 400 }, (_, i) => i + 1).find((s) => {
    const m = generateDungeon(request(s));
    return wingsOf(m, 1).length >= 2 && wingsOf(m, 0).length >= 1;
  })!;
  const model = generateDungeon(request(seed));
  const floor = model.floors[1]!;
  const [hiddenWing, keptWing] = wingsOf(model, 1);

  it('names each wing by its first room, behind the secret door', () => {
    for (const wing of wingsOf(model, 1)) {
      expect(floor.doors.some((door) => door.to === wing && door.kind === 'secret')).toBe(true);
    }
    expect(secretWingOf(floor.rooms, floor.rooms[0]!.id)).toBeNull();
  });

  it('takes that wing out of its floor\'s view and walls, and leaves the other and every other floor', () => {
    const edited = applyDungeonEdits(model, withWingHidden(NO_EDITS, 1, hiddenWing!));
    expect(edited.floors[1]!.hiddenWings).toEqual([hiddenWing]);
    expect(edited.floors[0]).toBe(model.floors[0]);
    const shown = visibleDungeon(edited, DEFAULT_VIEW, 1).rooms;
    const inWing = (room: { id: number }, wing: number): boolean => secretWingOf(floor.rooms, room.id) === wing;
    expect(shown.some((room) => inWing(room, hiddenWing!))).toBe(false);
    expect(shown.some((room) => inWing(room, keptWing!))).toBe(true);
    expect(visibleDungeon(edited, DEFAULT_VIEW, 1).doors.some((door) => door.to === hiddenWing)).toBe(false);
    const placement = { originCell: { x: 0, y: 0 }, pxPerCell: 100 };
    const walls = (m: Model): number => Object.keys(dungeonWalls(m, dungeonStyle('parchment'), DEFAULT_VIEW, placement, 1).walls).length;
    expect(walls(edited)).toBeLessThan(walls(model));
  });

  it('hides every wing when the view hides secret rooms, whatever was hidden by hand', () => {
    const edited = applyDungeonEdits(model, withWingHidden(NO_EDITS, 1, hiddenWing!));
    for (const index of [0, 1]) expect(visibleDungeon(edited, { secrets: false }, index).rooms.some((room) => room.wing === 'secret')).toBe(false);
  });
});
