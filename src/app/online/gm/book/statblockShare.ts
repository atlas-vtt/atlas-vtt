import type { BookAbilityMessage, BookFieldMessage } from '../../protocol/index.ts';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import type { NotePatch } from '../../../statblocks/notes/patchTypes';
import { checkAbilityEdit } from './abilityEdit.ts';
import type { PlayedCharacter } from './characters.ts';
import { checkFieldEdit } from './fieldEdit.ts';
import type { EditInputs } from './statblockChecks.ts';
import type { StatblockWriteOutcome } from './statblockGate.ts';
import type { DrawnStatblock } from './statblockSheet.ts';
import { NO_STATBLOCK, StatblockSheets } from './statblockSheets.ts';

export interface StatblockSharePorts {
  read(path: string): Promise<ResolvedStatblock | null>;
  write(path: string, patches: readonly NotePatch[]): Promise<StatblockWriteOutcome>;
  now(): number;
  /** A statblock was read or drawn anew, or an edit is under way: the books are looked at again. */
  changed(): void;
  /** A player's edit was taken: they are sent their statblock again, whether or not it reads otherwise. */
  answered(player: string): void;
  /** A player's edit was refused once it was written: they are owed their whole book. */
  owe(player: string): void;
}

/**
 * The players' own characters' statblocks: each character's note drawn as its player is sent it,
 * the whole texts it names served to that player alone, and the player's edits of its values and
 * abilities checked against what they were last sent and what the note holds now, then written
 * into the note through Atlas's note writer. A statblock edit is never a step of the map's undo
 * history: it is the note's.
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
  write(from: string, character: PlayedCharacter, message: BookFieldMessage | BookAbilityMessage): boolean {
    const path = character.statblockPath;
    // While the note may have changed (a template restricting a field) it is read again first: nothing is checked against the old one.
    if (path === null || !this.sheets.checkable(path)) return false;
    const sent = this.sentTo.get(from);
    // What the player was sent counts only while it is of this note (the GM may have linked another since).
    const inputs: EditInputs = { resolved: this.sheets.resolved(path), sent: sent?.path === path ? sent.drawn.statblock : null, read: (field) => this.sheets.read(path, field) };
    const checked = message.t === 'book-field' ? checkFieldEdit(inputs, message) : checkAbilityEdit(inputs, message);
    if (checked === null) return false;
    if (checked.patches.length === 0) {
      this.ports.answered(from);
      return true;
    }
    this.sheets.hold(path, checked.written);
    const refused = (): void => {
      this.sheets.drop(path);
      this.ports.owe(from);
    };
    void this.ports.write(path, checked.patches).then((outcome) => {
      if (outcome.conflicts.length > 0 || outcome.problem !== null) return refused();
      this.sheets.settle(path, checked.written);
      this.ports.answered(from);
    }, refused);
    this.ports.changed();
    return true;
  }
}
