/** The most characters a found note's card shows of its text. */
export const FOUND_EXCERPT = 220;

/**
 * The first words of a found note's Markdown as plain text, for its card in the log: embeds left
 * out, links as the words they show, emphasis, heading and list marks dropped, lines joined, cut at
 * a word with an ellipsis.
 */
export function foundExcerpt(markdown: string, max = FOUND_EXCERPT): string {
  const plain = markdown
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, ' ')
    .replace(/!\[\[[^\]\n]*\]\]|!\[[^\]\n]*\]\([^)\n]*\)/g, ' ')
    .replace(/\[\[([^\]|\n]*)\|([^\]\n]*)\]\]/g, '$2')
    .replace(/\[\[([^\]\n]*)\]\]/g, (_, target: string) => target.split('#').pop() ?? target)
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/^\s{0,3}(?:>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = [...plain];
  if (characters.length <= max) return plain;
  const cut = characters.slice(0, max).join('');
  const word = cut.lastIndexOf(' ');
  return `${(word > max / 2 ? cut.slice(0, word) : cut).trimEnd()}…`;
}
