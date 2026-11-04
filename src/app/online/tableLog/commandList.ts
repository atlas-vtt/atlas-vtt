/** A command of the message field, as the suggestions and the help list it. */
export interface CommandInfo {
  /** Its shortest spelling, without the slash. */
  readonly name: string;
  /** Its other spellings. */
  readonly aliases: readonly string[];
  /** What comes after it, as an example. */
  readonly usage: string;
  readonly description: string;
  /** Does what it does with nothing after it: Enter on it sends instead of completing it. */
  readonly standsAlone?: true;
}

/** Foundry VTT's chat commands, in the order they are offered. */
export const COMMANDS: readonly CommandInfo[] = [
  { name: 'r', aliases: ['roll'], usage: '1d20+5 # Attack', description: 'Roll dice in your roll mode' },
  { name: 'pr', aliases: ['publicroll'], usage: '1d20', description: 'Roll for everyone to see' },
  { name: 'gmr', aliases: ['gmroll'], usage: '1d20', description: 'Roll for yourself and the GM' },
  { name: 'br', aliases: ['broll', 'blindr', 'blindroll'], usage: '1d20', description: 'Roll blind: only the GM sees the result' },
  { name: 'sr', aliases: ['selfroll'], usage: '1d20', description: 'Roll for yourself alone' },
  { name: 'w', aliases: ['whisper'], usage: 'Kara Hello, or /w [Kara, GM] Hello', description: 'Whisper to someone' },
  { name: 'gm', aliases: [], usage: 'Hello', description: 'Whisper to the GM', standsAlone: true },
  { name: 'players', aliases: [], usage: 'Hello', description: 'Whisper to every player', standsAlone: true },
  { name: 'reply', aliases: [], usage: 'Hello', description: 'Whisper back to your last whisper', standsAlone: true },
  { name: 'ic', aliases: [], usage: 'Hello', description: 'Say it in character, as your token' },
  { name: 'ooc', aliases: [], usage: 'Hello', description: 'Say it out of character, as yourself' },
  { name: 'em', aliases: ['emote', 'me'], usage: 'draws her sword', description: 'Describe what you do' },
  { name: 'help', aliases: [], usage: '', description: 'Show the commands and the dice notation', standsAlone: true },
];

/** The command a spelling names (any case), or null. */
export function commandNamed(word: string): CommandInfo | null {
  const spelling = word.toLowerCase();
  return COMMANDS.find((command) => command.name === spelling || command.aliases.includes(spelling)) ?? null;
}
