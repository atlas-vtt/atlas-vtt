import { markdownLinkAt } from './markdownLink';

/**
 * Fantasy Statblocks hands out bestiary values with their links encoded:
 * `<STATBLOCK-WIKI-LINK>path|alias<STATBLOCK-WIKI-LINK>` for `[[path|alias]]` and
 * `<STATBLOCK-MARKDOWN-LINK>path|alias<STATBLOCK-MARKDOWN-LINK>` for `[alias](path)`.
 * Markdown reads the markers as HTML and drops them, which left `path|alias` as text.
 */
const ENCODED_WIKI_LINK = /<STATBLOCK-WIKI-LINK>([\s\S]+?)<STATBLOCK-WIKI-LINK>/g;
const ENCODED_MARKDOWN_LINK = /<STATBLOCK-MARKDOWN-LINK>([\s\S]+?)(?:\|([\s\S]+?))?<STATBLOCK-MARKDOWN-LINK>/g;
/** A destination the note wrote in angle brackets (`[a](<my notes/a.md>)`), which the marker keeps. */
const BRACKETED_PATH = /^<([\s\S]*)>$/;
/** A destination followed by a link title (`https://x.com "Title"`). */
const TITLED_DESTINATION = /^\S+\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/;

const WIKI_LINK = /!?\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** The links of a bestiary value as the note wrote them, as Fantasy Statblocks' own `stringifyLinks` does. */
export function decodeStatblockLinks(text: string): string {
  return text
    .replace(ENCODED_WIKI_LINK, (_match, link: string) => `[[${link}]]`)
    .replace(ENCODED_MARKDOWN_LINK, (_match, path: string, alias: string | undefined) =>
      `[${alias ?? ''}](${linkDestination(path)})`);
}

/** Angle brackets keep a path with spaces one link destination; any other stays as the note wrote it. */
function linkDestination(path: string): string {
  if (BRACKETED_PATH.test(path)) return path;
  return /\s/.test(path) && !TITLED_DESTINATION.test(path) ? `<${path}>` : path;
}

/** A linked note by its name: no folders, no heading, no extension, no URL escapes. */
function linkedNoteName(target: string): string {
  let name = target.trim().split('#')[0]!.split('/').pop() ?? '';
  try { name = decodeURI(name); } catch { /* keep the escaped name */ }
  return name.replace(/\.md$/i, '');
}

function linkText(target: string, alias: string | undefined): string {
  return alias?.trim() ? alias.trim() : linkedNoteName(target);
}

/** Text with each Markdown link, an embedded one too (`![words](address)`), as the words it shows. */
function markdownLinksAsText(text: string): string {
  let read = '';
  let from = 0;
  // Where a link's words meet its address: none ahead, no link ahead.
  let joint = -1;
  for (let at = text.indexOf('['); at >= 0; at = text.indexOf('[', at + 1)) {
    if (joint < at) joint = text.indexOf('](', at);
    if (joint < 0) break;
    const link = markdownLinkAt(text, at);
    if (!link) continue;
    const start = at > from && text[at - 1] === '!' ? at - 1 : at;
    read += text.slice(from, start) + linkText(link.address, link.words);
    from = link.end;
    at = link.end - 1;
  }
  return read + text.slice(from);
}

/** Statblock text with every link, encoded or written out, as the words it shows. */
export function statblockLinksAsText(text: string): string {
  return markdownLinksAsText(decodeStatblockLinks(text)
    .replace(WIKI_LINK, (_match, target: string, alias: string | undefined) => linkText(target, alias)));
}
