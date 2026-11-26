/** The most characters a found note's card shows of its text. */
export const FOUND_EXCERPT = 220;

/** A table's delimiter row (`| :--- | --: |`): what a table's text leaves out. */
const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** A pipe that splits a table's cells: not escaped, and not the alias pipe inside a `[[link|alias]]`. */
const CELL_PIPE = /\[\[[^\]\n]*\]\]|\\\||\|/g;

/**
 * The Markdown with every table as the words of its cells: its delimiter row left out, the pipes
 * between cells as spaces, an escaped pipe (`\|`) as the pipe it stands for. A table is a row holding
 * a pipe over a delimiter row, and the rows under them up to a blank line.
 */
function tablesAsText(markdown: string): string {
  const lines = markdown.split('\n');
  const kept: string[] = [];
  const cellText = (found: string): string => {
    if (found === '|') return ' ';
    return found === '\\|' ? '|' : found;
  };
  let inTable = false;
  lines.forEach((line, index) => {
    if (line.trim() === '') inTable = false;
    else if (!inTable && line.includes('|') && DELIMITER_ROW.test(lines[index + 1] ?? '')) inTable = true;
    else if (inTable && DELIMITER_ROW.test(line)) return;
    kept.push(inTable ? line.replace(CELL_PIPE, cellText) : line);
  });
  return kept.join('\n');
}

/**
 * The first words of a found note's Markdown as plain text, for its card in the log: embeds left
 * out, links as the words they show, tables as the words of their cells, emphasis, heading and list
 * marks dropped, lines joined, cut at a word with an ellipsis.
 */
export function foundExcerpt(markdown: string, max = FOUND_EXCERPT): string {
  const plain = tablesAsText(markdown)
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
