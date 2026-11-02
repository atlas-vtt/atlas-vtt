import { t, type MessageKey } from '../../i18n';
import type { NotePin } from '../../types';
import type { CaveAlwaysTrait, CaveNeverTrait, CaveVariant, DungeonModel } from '../model';
import { visibleFloor } from '../render/visibleDungeon';
import type { DungeonView } from '../style';
import { roomFacts } from './roomFacts';
import { keyedRooms } from './roomKeys';
import { pinCell } from './roomPins';
import type { DungeonPlacement } from './toWalls';

/** A room of the note: its heading, its line of facts, and where its pin stands (world px) on which level. */
export interface NoteRoom {
  key: string;
  heading: string;
  facts: string;
  pin: { x: number; y: number };
  /** The level of its floor; unset in a scene of one floor. */
  level?: string;
}

/**
 * Every normal room the view shows, floor by floor from the entry floor down, each in key order
 * (`keyedRooms`). `levelIds` are the scene's levels by floor, null for a scene of one floor.
 */
export function noteRooms(model: DungeonModel, view: Pick<DungeonView, 'secrets' | 'props' | 'water'>, placement: DungeonPlacement, levelIds: readonly string[] | null): NoteRoom[] {
  const { originCell, pxPerCell } = placement;
  return model.floors.flatMap((_, index) => {
    const visible = visibleFloor(model, view, index);
    const level = levelIds?.[index];
    return keyedRooms(visible, model.floors.length).map(({ room, key, heading }) => {
      const cell = pinCell(visible, room);
      return {
        key,
        heading,
        facts: roomFacts(visible, room, view),
        pin: { x: (cell.x - originCell.x) * pxPerCell, y: (cell.y - originCell.y) * pxPerCell },
        ...(level && { level }),
      };
    });
  });
}

const ALWAYS: Readonly<Record<CaveAlwaysTrait, MessageKey>> = {
  'curves-back': 'dungeonScene.character.always.curvesBack',
  'narrows-then-opens': 'dungeonScene.character.always.narrowsThenOpens',
  'low-roofs': 'dungeonScene.character.always.lowRoofs',
  'maximum-size': 'dungeonScene.character.always.maximumSize',
  'shifting-scale': 'dungeonScene.character.always.shiftingScale',
  'floor-exits': 'dungeonScene.character.always.floorExits',
  'roof-exits': 'dungeonScene.character.always.roofExits',
  'still-pools': 'dungeonScene.character.always.stillPools',
  'balanced-boulders': 'dungeonScene.character.always.balancedBoulders',
  'flowstone-crust': 'dungeonScene.character.always.flowstoneCrust',
  'cracks-everywhere': 'dungeonScene.character.always.cracksEverywhere',
  'endless-drips': 'dungeonScene.character.always.endlessDrips',
  'up-and-down': 'dungeonScene.character.always.upAndDown',
  'blocked-ways': 'dungeonScene.character.always.blockedWays',
};

const NEVER: Readonly<Record<CaveNeverTrait, MessageKey>> = {
  'dead-passages': 'dungeonScene.character.never.deadPassages',
  'standing-room': 'dungeonScene.character.never.standingRoom',
  'regular-caves': 'dungeonScene.character.never.regularCaves',
  'calm-water': 'dungeonScene.character.never.calmWater',
  'sloped-walls': 'dungeonScene.character.never.slopedWalls',
  'plain-walk': 'dungeonScene.character.never.plainWalk',
};

/** What made the cave, said as a fact of the rock. */
const FORMATION: Readonly<Record<CaveVariant, MessageKey>> = {
  limestone: 'dungeonScene.formation.limestone',
  'lava-tube': 'dungeonScene.formation.lavaTube',
  underdark: 'dungeonScene.formation.underdark',
  fault: 'dungeonScene.formation.fault',
  sulphuric: 'dungeonScene.formation.sulphuric',
  fungal: 'dungeonScene.formation.fungal',
  burrow: 'dungeonScene.formation.burrow',
};

/**
 * A cave's character as someone who walked it would put it: what made it, then what it always and
 * never does; null for a model without a character. A formation this Atlas does not know (a model
 * from a newer one) is left out.
 */
export function caveCharacterLine(model: Pick<DungeonModel, 'cave'>): string | null {
  const cave = model.cave;
  const character = cave?.character;
  if (!cave || !character) return null;
  const line = t('dungeonScene.character', { always: t(ALWAYS[character.always]), never: t(NEVER[character.never]) });
  const formation: MessageKey | undefined = FORMATION[cave.variant];
  return formation ? t('dungeonScene.formationLine', { formation: t(formation), character: line }) : line;
}

/** The scene's note: the GM's name, a cave's character, then a heading per room with its line of facts. */
export function dungeonNote(title: string, rooms: readonly NoteRoom[], model?: Pick<DungeonModel, 'cave'>): string {
  const character = model ? caveCharacterLine(model) : null;
  return [`# ${title}`, ...(character ? [character] : []), ...rooms.map(room => `## ${room.heading}\n\n${room.facts}`)].join('\n\n') + '\n';
}

/** A GM-only numbered pin in each room, labelled with its key, linking its heading in the note at `notePath`. */
export function roomPins(rooms: readonly NoteRoom[], notePath: string): Record<string, NotePin> {
  return Object.fromEntries(rooms.map((room): [string, NotePin] => {
    const id = `pin_dungeon_${room.key}`;
    return [id, {
      id,
      kind: 'pin',
      x: room.pin.x,
      y: room.pin.y,
      notePath: `${notePath}#${room.heading}`,
      icon: 'number',
      label: room.key,
      gmOnly: true,
      ...(room.level && { level: room.level }),
    }];
  }));
}
