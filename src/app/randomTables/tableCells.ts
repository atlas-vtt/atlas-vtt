/**
 * Splitting one line of a Markdown table into its cells. An escaped pipe (`\|`)
 * stays in its cell, as does the alias pipe of a wikilink (`[[Note|Alias]]`),
 * which Obsidian authors write escaped or not. Runs in one pass over the line,
 * whatever its brackets.
 */

export interface SplitLine {
  readonly cells: string[];
  /** Pipes that separate cells; a line with none is no table line. */
  readonly pipes: number;
}

/** The cells of a table line, each trimmed; the pipes at either end open and close the row. */
export function splitTableLine(line: string): SplitLine {
  const text = line.trim();
  const lastClose = text.lastIndexOf(']]');
  const cells: string[] = [];
  let current = '';
  let pipes = 0;
  let endsWithPipe = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    endsWithPipe = false;
    if (char === '\\' && text[i + 1] === '|') {
      current += '|';
      i += 2;
      continue;
    }
    if (char === '[' && text[i + 1] === '[' && i + 2 <= lastClose) {
      const close = text.indexOf(']]', i + 2);
      current += text.slice(i, close + 2).replace(/\\\|/g, '|');
      i = close + 2;
      continue;
    }
    if (char === '|') {
      cells.push(current.trim());
      current = '';
      pipes++;
      endsWithPipe = true;
    } else {
      current += char;
    }
    i++;
  }
  if (!endsWithPipe) cells.push(current.trim());
  if (text.startsWith('|')) cells.shift();
  return { cells, pipes };
}

const DELIMITER_CELL = /^:?-+:?$/;

/** Whether the line is a table's delimiter row (`| --- | :-: |`) for `columns` header cells. */
export function isDelimiterRow(line: SplitLine, columns: number): boolean {
  return line.pipes > 0 && line.cells.length === columns && line.cells.every((cell) => DELIMITER_CELL.test(cell));
}
