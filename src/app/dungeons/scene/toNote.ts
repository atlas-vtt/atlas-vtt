import type { NotePin } from '../../types';
import type { DungeonModel } from '../model';
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

/** The scene's note: the GM's name, then a heading per room with its line of facts. */
export function dungeonNote(title: string, rooms: readonly NoteRoom[]): string {
  return [`# ${title}`, ...rooms.map(room => `## ${room.heading}\n\n${room.facts}`)].join('\n\n') + '\n';
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
