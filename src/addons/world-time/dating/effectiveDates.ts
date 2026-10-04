import type { DrawingStroke, NotePin, TextElement, TokenEntity } from 'src/app/types';
import type { WorldDated } from '../worldDated';
import type { DateBounds } from './dateRange';

/** Kinds of map objects that can carry dates. */
export type DatedKind = 'pin' | 'token' | 'text' | 'drawing';

/** Date fields of a note's frontmatter, already in storage form. */
export interface NoteDates {
  from?: string;
  to?: string;
  born?: string;
  died?: string;
}

/** Where the dates of an object came from, for the properties dialog. */
export type DateSource = 'object' | 'note' | 'none';

export interface EffectiveDates extends DateBounds {
  fromSource: DateSource;
  toSource: DateSource;
}

/** The note an object links to, whose frontmatter dates it inherits. */
export function linkedNotePath(kind: DatedKind, object: NotePin | TokenEntity | TextElement | DrawingStroke): string | undefined {
  if (kind === 'pin') return (object as NotePin).notePath || undefined;
  if (kind === 'token') {
    const token = object as TokenEntity;
    if (token.kind !== 'character') return undefined;
    return token.notePath || token.statblockPath || undefined;
  }
  return undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

/**
 * Each end separately: the object's own date, else the note's `from`/`to`,
 * else (for people) `born`/`died`.
 */
export function effectiveDates(own: WorldDated, note: NoteDates | undefined): EffectiveDates {
  const ownFrom = nonEmpty(own.from);
  const ownTo = nonEmpty(own.to);
  const inherited = own.dateInherit === false ? undefined : note;
  const noteFrom = nonEmpty(inherited?.from) ?? nonEmpty(inherited?.born);
  const noteTo = nonEmpty(inherited?.to) ?? nonEmpty(inherited?.died);
  const from = ownFrom ?? noteFrom;
  const to = ownTo ?? noteTo;
  return {
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    fromSource: ownFrom ? 'object' : noteFrom ? 'note' : 'none',
    toSource: ownTo ? 'object' : noteTo ? 'note' : 'none',
  };
}
