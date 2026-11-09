import { decodeStatblockLinks, statblockLinksAsText } from '../../../services/statblockLinks';

/** Words in emphasis (`**x**`, `__x__`, `*x*`, `_x_`), not where the marks stand inside a word or number. */
const EMPHASIS = /(?<![\p{L}\p{N}\\])(\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu;
/** A name that is one wikilink and nothing else: `[[Note#Heading|Alias]]`. */
const WHOLE_WIKI_LINK = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/;
/** A name that is one Markdown link and nothing else: `[Chill Touch](#Chill%20Touch)`. */
const WHOLE_MARKDOWN_LINK = /^\[[^\]]*\]\(<?([^)>]+)>?\)$/;
/** A destination outside the vault (`https:`, `obsidian:`). */
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

function withoutEmphasis(text: string): string {
  let plain = text;
  for (let previous = ''; previous !== plain;) [previous, plain] = [plain, plain.replace(EMPHASIS, '$2')];
  return plain;
}

/** An ability's name as it reads: links as the words they show, emphasis marks left out. */
export function plainAbilityName(name: string): string {
  return withoutEmphasis(statblockLinksAsText(name)).replace(/\s+/g, ' ').trim();
}

/**
 * The note or heading an ability's name links where the name is that link alone (in emphasis or
 * not): `Note#Heading` as Obsidian resolves it, `#Heading` for a heading of the statblock's own
 * note. Null for any other name, and for a link out of the vault.
 */
export function abilityLink(name: string): string | null {
  const bare = withoutEmphasis(decodeStatblockLinks(name).trim());
  const wiki = WHOLE_WIKI_LINK.exec(bare)?.[1]?.trim();
  if (wiki !== undefined) return wiki === '' ? null : wiki;
  const target = WHOLE_MARKDOWN_LINK.exec(bare)?.[1]?.trim();
  if (!target || EXTERNAL.test(target)) return null;
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}
