/**
 * The `[[` link being typed in a field, and the text a picked link puts in
 * its place. Pure: no DOM, no vault.
 */

/** A link being typed: where its `[[` stands, and what follows it up to the caret. */
export interface LinkQuery {
  start: number;
  /** The link's path so far, without its heading. */
  path: string;
  /** What follows a `#`: the heading being looked for; null before one is typed. */
  heading: string | null;
}

/** The link the text before the caret ends in, if it is still being typed: no `]]`, alias or line break after its `[[`. */
export function linkQueryBefore(before: string): LinkQuery | null {
  const start = before.lastIndexOf('[[');
  if (start < 0) return null;
  const typed = before.slice(start + 2);
  if (/[\]|\n]/.test(typed)) return null;
  const hash = typed.indexOf('#');
  return hash < 0 ? { start, path: typed, heading: null } : { start, path: typed.slice(0, hash), heading: typed.slice(hash + 1) };
}

/** What a picked suggestion links to. */
export interface PickedLink {
  /** The note's link text, as the vault's link format writes it. */
  linktext: string;
  heading?: string | undefined;
  alias?: string | undefined;
}

/** A heading as a link names it: the characters a link cannot hold read as spaces, as Obsidian writes them. */
export function linkSafeHeading(heading: string): string {
  return heading.replace(/[#|^[\]\\:]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The link as a wikilink. Statblock values live in frontmatter, where
 * Obsidian takes only wikilinks as links (renames follow them), so it is one
 * whatever the vault's link style; the path follows the vault's format.
 */
export function wikilink({ linktext, heading, alias }: PickedLink): string {
  const subpath = heading ? `#${linkSafeHeading(heading)}` : '';
  return `[[${linktext}${subpath}${alias ? `|${alias}` : ''}]]`;
}

/** The replacement a picked link makes: from its `[[` to the caret, and a `]]` right after the caret if one stands there. */
export function linkReplacement(text: string, query: LinkQuery, caret: number, link: string): { from: number; to: number; caret: number } {
  const to = text.startsWith(']]', caret) ? caret + 2 : caret;
  return { from: query.start, to, caret: query.start + link.length };
}
