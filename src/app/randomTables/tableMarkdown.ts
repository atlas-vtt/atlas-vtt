/**
 * The note Atlas writes for a pasted table: its name as a heading and the table
 * in Markdown, written so that `markdownTables.ts` reads back the same cells.
 * Pure.
 */

import type { PastedTable } from './pastedTable';

/** One line of text: line breaks read as spaces. */
function oneLine(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ').trim();
}

/** A cell as a table line holds it: every pipe not yet escaped is, the alias pipe of a `[[link|alias]]` too. */
function escapedCell(text: string): string {
  return oneLine(text).replace(/(?<!\\)\|/g, '\\|');
}

function tableLine(cells: readonly string[]): string {
  return `|${cells.map((text) => {
    const escaped = escapedCell(text);
    return escaped === '' ? ' ' : ` ${escaped} `;
  }).join('|')}|`;
}

/** The text of the note Atlas writes for a pasted table: `## <name>`, a blank line, the Markdown table, a final newline, nothing else. */
export function tableNoteText(name: string, table: PastedTable): string {
  const lines = [
    tableLine(table.headers),
    `|${table.headers.map(() => ' --- ').join('|')}|`,
    ...table.rows.map(tableLine),
  ];
  return `## ${oneLine(name)}\n\n${lines.join('\n')}\n`;
}
