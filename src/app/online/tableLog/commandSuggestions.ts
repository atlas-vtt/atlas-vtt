import { GM_AUTHOR, type TablePerson } from '../protocol/index.ts';
import { COMMANDS } from './commandList.ts';

/** A command the field offers while one is typed: completing it writes `insert`. */
export interface CommandSuggestion {
  readonly kind: 'command';
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly insert: string;
  /** Typed in full already, and does its work with nothing after it: Enter sends it. */
  readonly sendsAsTyped: boolean;
}

/** Someone `/w` may whisper to: completing them keeps them as the audience. */
export interface PersonSuggestion {
  readonly kind: 'person';
  readonly key: string;
  readonly label: string;
  readonly id: string;
}

export type Suggestion = CommandSuggestion | PersonSuggestion;

const TYPING_COMMAND = /^\/([a-z]*)$/i;
const TYPING_NAME = /^\/(?:w|whisper)\s+([^\s[\]]*)$/i;

function commandSuggestions(typed: string, self: string | null): readonly Suggestion[] {
  const lower = typed.toLowerCase();
  const offered: Suggestion[] = [];
  for (const command of COMMANDS) {
    if (command.name === 'gm' && self === GM_AUTHOR) continue;
    const spelling = [command.name, ...command.aliases].find((word) => word.startsWith(lower));
    if (spelling === undefined) continue;
    offered.push({
      kind: 'command', key: command.name, label: `/${spelling}`, description: command.description, insert: `/${spelling} `,
      sendsAsTyped: spelling === lower && command.standsAlone === true,
    });
  }
  return offered;
}

function personSuggestions(typed: string, people: readonly TablePerson[], self: string | null): readonly Suggestion[] {
  const lower = typed.toLocaleLowerCase();
  const everyone = [...(self === GM_AUTHOR ? [] : [{ id: GM_AUTHOR, name: 'GM' }]), ...people.filter((person) => person.id !== self && person.away !== true)];
  return everyone
    .filter((person) => person.name.toLocaleLowerCase().startsWith(lower))
    .map((person) => ({ kind: 'person', key: person.id, label: person.name, id: person.id }));
}

/**
 * What the field offers for what is typed: the commands while a slash and the start of a word are
 * all there is, and the people (the GM first) while a name is typed after `/w`.
 */
export function suggestionsFor(draft: string, people: readonly TablePerson[], self: string | null): readonly Suggestion[] {
  const command = TYPING_COMMAND.exec(draft);
  if (command !== null) return commandSuggestions(command[1]!, self);
  const name = TYPING_NAME.exec(draft);
  return name === null ? [] : personSuggestions(name[1]!, people, self);
}
