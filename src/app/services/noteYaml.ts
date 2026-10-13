/**
 * Parsing the YAML of notes.
 *
 * A note is not Atlas' own text: it may come in a bundle or a shared vault. What the parser
 * costs depends on the text, and a text of anchors and aliases can cost it far more than its
 * length, before any value comes back that could be read within limits. So the text is checked
 * first, in one pass, and only a text within `NOTE_YAML_LIMITS` reaches the parser.
 */

import { parseYaml } from 'obsidian';

export const NOTE_YAML_LIMITS = {
  /** Characters of one text. A statblock's fence or frontmatter has a few thousand. */
  characters: 32 * 1024,
  /** Aliases of the anchors of one text. Statblocks use neither. */
  aliases: 16,
} as const;

/** The characters that end the name of an anchor or alias, as the parser reads it. */
const NAME_ENDS = new Set([' ', '\t', '\n', '\r', ',', '[', ']', '{', '}']);
const VERBATIM_TAG_ENDS = new Set(['>', ' ', '\t', '\n', '\r']);
const LINE_BREAKS = new Set(['\n', '\r', '\u0085', '\u2028', '\u2029']);
const BLANKS = new Set([' ', '\t', '\uFEFF']);
/** After one of these a node may start: an entry, a key, a value, or an item of a flow list or map. */
const NODE_OPENERS = new Set(['-', '?', ':', ',', '[', '{']);

/** Where the name that starts at `from` ends. */
function nameEnd(text: string, from: number): number {
  let end = from;
  while (end < text.length && !NAME_ENDS.has(text.charAt(end))) end += 1;
  return end;
}

/**
 * Where the tag that starts at `index` ends, as the parser reads it. A tag written out in full
 * (`!<…>`) runs to its `>` and may hold the characters that end a name; a short one ends no later
 * than a name does.
 */
function tagEnd(text: string, index: number): number {
  if (text.charAt(index + 1) !== '<') return nameEnd(text, index + 1);
  let end = index + 2;
  while (end < text.length && !VERBATIM_TAG_ENDS.has(text.charAt(end))) end += 1;
  return text.charAt(end) === '>' ? end + 1 : end;
}

/**
 * How many aliases (`*name`) of its own anchors (`&name`) a YAML text may hold. The parser takes
 * `&` and `*` for one only where a node may start: at the start of a line, after an indicator
 * (`- `, `? `, `: `, `[`, `{`, `,`) and after a tag or an anchor. Every such place is read here,
 * so the parser never finds an anchor or an alias this does not. It may find fewer: inside a
 * quoted or a block text the same characters are text, and telling those apart would take the
 * parser itself. An alias counts only where an anchor of its name is in the text, since no other
 * can be followed. So emphasis and ampersands count for nothing: in running text they follow a
 * word (`a *word*`, `D&D`, `1d4 & more`), and where they open a line or follow a comma they
 * would have to name each other (`&c.` and `*Hit:*` do not).
 */
export function aliasesOfAnchors(text: string): number {
  const anchors = new Set<string>();
  const aliases: string[] = [];
  let nodeMayStart = true;

  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    if (LINE_BREAKS.has(character)) {
      nodeMayStart = true;
    } else if (BLANKS.has(character)) {
      // Keeps what came before it.
    } else if (nodeMayStart && character === '!') {
      // A tag is passed over: the node still starts after it.
      index = tagEnd(text, index) - 1;
    } else if (nodeMayStart && (character === '&' || character === '*')) {
      const end = nameEnd(text, index + 1);
      const name = text.slice(index + 1, end);
      if (name !== '' && character === '&') anchors.add(name);
      if (name !== '' && character === '*') aliases.push(name);
      index = end - 1;
    } else {
      nodeMayStart = NODE_OPENERS.has(character);
    }
  }
  return aliases.filter((name) => anchors.has(name)).length;
}

function withinLimits(text: string): boolean {
  return text.length <= NOTE_YAML_LIMITS.characters && aliasesOfAnchors(text) <= NOTE_YAML_LIMITS.aliases;
}

/**
 * Parses YAML that a note, a base or a bundle holds: the one way such text reaches the parser.
 * A text beyond `NOTE_YAML_LIMITS` is refused as a text that is no YAML is: this throws, and the
 * caller does what it does for any text it cannot parse.
 */
export function parseNoteYaml(text: string): unknown {
  if (!withinLimits(text)) throw new Error('The text is beyond what Atlas reads as YAML.');
  return parseYaml(text);
}
