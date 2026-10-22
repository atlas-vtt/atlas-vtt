import type { BookAbilityMessage, BookFieldMessage, BookListMessage, BookStatblock } from '../../protocol/index.ts';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import type { NotePatch } from '../../../statblocks/notes/patchTypes';
import { checkAbilityEdit } from './abilityEdit.ts';
import type { PlayedCharacter } from './characters.ts';
import { checkFieldEdit, checkMaxFieldEdit } from './fieldEdit.ts';
import { checkListEdit } from './listEdit.ts';
import type { CheckedEdit, EditInputs } from './statblockChecks.ts';
import type { StatblockWriteOutcome } from './statblockGate.ts';
import type { DrawnStatblock } from './statblockSheet.ts';
import { NO_STATBLOCK, StatblockSheets } from './statblockSheets.ts';

export interface StatblockSharePorts {
  read(path: string): Promise<ResolvedStatblock | null>;
  write(path: string, patches: readonly NotePatch[]): Promise<StatblockWriteOutcome>;
  now(): number;
  /** The width of the GM's statblock panel, which the players' cards are laid out at; unset, a default. */
  panelWidth?(): number | undefined;
  /** The note at `path` was read or its statblock drawn anew, or an edit of it is under way: the books of its characters are looked at again. */
  changed(path: string): void;
  /**
   * A player's edit was taken: they are sent their statblock again, whether or not it reads
   * otherwise, unless `asSent` (their page shows what they were sent: the edit set a value to what
   * it was), when only a statblock that reads otherwise goes.
   */
  answered(player: string, asSent: boolean): void;
  /** A player's edit was refused once it was written: they are owed their whole book. */
  owe(player: string): void;
}

/** A player's edit of their character's statblock: a value, an entry of a list, or an ability. */
type StatblockEditMessage = BookFieldMessage | BookAbilityMessage | BookListMessage;

/** A player's edit checked by the check for its kind. */
function checkedEdit(inputs: EditInputs, message: StatblockEditMessage): CheckedEdit | null {
  switch (message.t) {
    case 'book-field': return checkFieldEdit(inputs, message);
    case 'book-list': return checkListEdit(inputs, message);
    case 'book-ability': return checkAbilityEdit(inputs, message);
  }
}

/**
 * The players' own characters' statblocks: each character's note drawn as its player is sent it,
 * the whole texts it names served to that player alone, and the player's edits of its values,
 * lists and abilities checked against what they were last sent and what the note holds now, then
 * written into the note through Atlas's note writer. A statblock edit is never a step of the map's
 * undo history: it is the note's.
 */
export class StatblockShare {
  private readonly sheets: StatblockSheets;
  /** What each player was last sent of their statblock, and the note it was drawn of. */
  private readonly sentTo = new Map<string, { readonly path: string | null; readonly drawn: DrawnStatblock }>();

  constructor(private readonly ports: StatblockSharePorts) {
    this.sheets = new StatblockSheets(ports);
  }

  /** The statblock a character's player gets now: none without a note, undefined while its note is read or drawn. */
  of(character: PlayedCharacter | null): DrawnStatblock | undefined {
    if (character === null || character.statblockPath === null) return NO_STATBLOCK;
    return this.sheets.drawn(character.statblockPath, character.drawnWith.definitions, character.drawnWith.resources);
  }

  /** A character's note as it is drawn now; undefined before it was read. */
  resolved(path: string): ResolvedStatblock | null | undefined {
    return this.sheets.resolved(path);
  }

  /** What a player was sent of their character's statblock: null when a book went without one. */
  sent(player: string, character: PlayedCharacter | null, drawn: DrawnStatblock | null): void {
    if (drawn === null) this.sentTo.delete(player);
    else this.sentTo.set(player, { path: character?.statblockPath ?? null, drawn });
  }

  /** The player left: what they were sent no longer counts. */
  left(player: string): void {
    this.sentTo.delete(player);
  }

  /** A whole text of the statblock this player was last sent, by hash; nothing for any other. */
  text(hash: string, player: string): Uint8Array<ArrayBuffer> | undefined {
    return this.sentTo.get(player)?.drawn.texts.find((asset) => asset.ref.hash === hash)?.bytes;
  }

  /** A note may read otherwise (every note for null): it is read again. */
  changed(path: string | null): void {
    this.sheets.forget(path);
  }

  /** Only the notes of characters still played are kept. */
  retain(paths: ReadonlySet<string>): void {
    this.sheets.retain(paths);
  }

  /** A player's edit of their own character's statblock: false when it is refused at once. */
  write(from: string, character: PlayedCharacter, message: StatblockEditMessage): boolean {
    const inputs = this.inputsFor(from, character);
    const checked = inputs === null ? null : checkedEdit(inputs, message);
    if (inputs === null || checked === null || character.statblockPath === null) return false;
    const asSent = inputs.sent !== null && inputs.sent !== undefined && showsAsSent(inputs.sent, message);
    this.commit(from, character.statblockPath, checked, () => this.ports.answered(from, asSent));
    return true;
  }

  /**
   * A maximum a player set of their character's resource that their note's number field `key` gives
   * (`checkMaxFieldEdit`): false when it is refused at once. `taken` follows once it is written (or
   * at once where the note holds that number already); a write refused later owes the player their book.
   */
  writeMax(from: string, character: PlayedCharacter, key: string, max: number, taken: () => void): boolean {
    const inputs = this.inputsFor(from, character);
    const checked = inputs === null ? null : checkMaxFieldEdit(inputs, key, max);
    if (checked === null || character.statblockPath === null) return false;
    this.commit(from, character.statblockPath, checked, taken);
    return true;
  }

  /** What a player's edit of their character's note is checked against; null while the note may have changed (a template restricting a field) and is read again first. */
  private inputsFor(from: string, character: PlayedCharacter): EditInputs | null {
    const path = character.statblockPath;
    if (path === null || !this.sheets.checkable(path)) return null;
    const sent = this.sentTo.get(from);
    // What the player was sent counts only while it is of this note (the GM may have linked another since).
    return { resolved: this.sheets.resolved(path), sent: sent?.path === path ? sent.drawn.statblock : null, read: (field) => this.sheets.read(path, field) };
  }

  /** Writes a checked edit into the note, held as written until it is read back; `taken` once it is in, the player owed their book where it is refused. */
  private commit(from: string, path: string, checked: CheckedEdit, taken: () => void): void {
    if (checked.patches.length === 0) return taken();
    this.sheets.hold(path, checked.written);
    const refused = (): void => {
      this.sheets.drop(path);
      this.ports.owe(from);
    };
    void this.ports.write(path, checked.patches).then((outcome) => {
      if (outcome.conflicts.length > 0 || outcome.problem !== null) return refused();
      this.sheets.settle(path, checked.written);
      taken();
    }, refused);
    this.ports.changed(path);
  }
}

/**
 * Whether a page that made this edit shows what it was sent: a value set, not a cell of a table, to
 * what every place of it in the statblock holds already. The page shows each edit at once, so for
 * any other edit what it shows is the GM's to confirm or correct.
 */
function showsAsSent(sent: BookStatblock, message: StatblockEditMessage): boolean {
  if (message.t !== 'book-field' || message.cell !== undefined) return false;
  const values = fieldValues(sent, message.key);
  const asked = JSON.stringify(message.value);
  return values.length > 0 && values.every((value) => JSON.stringify(value) === asked);
}

/** The values a statblock offers its player to change under `key`, wherever it shows them. */
function fieldValues(node: unknown, key: string): unknown[] {
  if (Array.isArray(node)) return node.flatMap((child) => fieldValues(child, key));
  if (node === null || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  const own = record.key === key && typeof record.base === 'string' && typeof record.type === 'string' ? [record.value] : [];
  return [...own, ...Object.values(record).flatMap((child) => fieldValues(child, key))];
}
