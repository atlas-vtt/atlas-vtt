import { MAX_BOOK_TITLE } from '../../protocol/index.ts';
import { markdownLinkAt, type MarkdownLink } from '../../../services/markdownLink';
import { decodeStatblockLinks, statblockLinksAsText } from '../../../services/statblockLinks';
import { clippedLine } from './bookTexts.ts';

/** Words in emphasis (`**x**`, `__x__`, `*x*`, `_x_`), not where the marks stand inside a word or number. */
const EMPHASIS = /(\*\*|__|\*|_)(\S(?:.*?\S)??)\1(?![\p{L}\p{N}])/gu;
/** What an opening mark may not follow: the end of a word or number, or an escape. */
const WORD_BEFORE = /[\p{L}\p{N}\\]$/u;
/** A name that is one wikilink and nothing else: `[[Note#Heading|Alias]]`. */
const WHOLE_WIKI_LINK = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/;
/** A destination outside the vault (`https:`, `obsidian:`). */
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/** `text` with each emphasis given way to its words, read once from the left: a mark inside a word opens nothing, and the search goes on right after it. */
function withoutEmphasisOnce(text: string): string {
  let plain = '';
  let from = 0;
  EMPHASIS.lastIndex = 0;
  for (let match = EMPHASIS.exec(text); match; match = EMPHASIS.exec(text)) {
    if (WORD_BEFORE.test(text.slice(Math.max(0, match.index - 2), match.index))) {
      EMPHASIS.lastIndex = match.index + 1;
      continue;
    }
    plain += text.slice(from, match.index) + (match[2] ?? '');
    from = EMPHASIS.lastIndex;
  }
  return plain + text.slice(from);
}

function withoutEmphasis(text: string): string {
  let plain = text;
  for (let previous = ''; previous !== plain;) [previous, plain] = [plain, withoutEmphasisOnce(plain)];
  return plain;
}

/**
 * The words and the address of a name that is one Markdown link and nothing else: the address may
 * hold brackets of its own that close (`[Rage (3/day)](#Rage%20(3/day))`, as a heading with
 * brackets is linked), stand in angle brackets or be followed by a title. Null for any other name.
 */
function wholeMarkdownLink(bare: string): MarkdownLink | null {
  const link = markdownLinkAt(bare, 0);
  return link?.end === bare.length ? link : null;
}

/** A name without the emphasis around it, its links as the note wrote them. */
const bareName = (name: string): string => withoutEmphasis(decodeStatblockLinks(name).trim());

/** An ability's name as it reads: links as the words they show, emphasis marks left out. */
export function plainAbilityName(name: string): string {
  const words = wholeMarkdownLink(bareName(name))?.words.trim();
  return withoutEmphasis(words || statblockLinksAsText(name)).replace(/\s+/g, ' ').trim();
}

/**
 * An ability's name as its player's sheet shows it: its plain words, read from the whole name and
 * only then cut to a line. A name cut first loses the end of a long link, and what is left of it is
 * no link any more. Null where nothing of it shows.
 */
export function shownAbilityName(name: string): string | null {
  return clippedLine(plainAbilityName(name), MAX_BOOK_TITLE);
}

/**
 * The note or heading an ability's name links where the name is that link alone (in emphasis or
 * not): `Note#Heading` as Obsidian resolves it, `#Heading` for a heading of the statblock's own
 * note. Null for any other name, and for a link out of the vault.
 */
export function abilityLink(name: string): string | null {
  const bare = bareName(name);
  const wiki = WHOLE_WIKI_LINK.exec(bare)?.[1]?.trim();
  if (wiki !== undefined) return wiki === '' ? null : wiki;
  const target = wholeMarkdownLink(bare)?.address.trim();
  if (!target || EXTERNAL.test(target)) return null;
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}
