/** Removes properties from a note's frontmatter as text; the note is never parsed as YAML. */

/** A top-level property line: the key (plain or quoted) before its colon. */
const TOP_LEVEL_KEY = /^("[^"]+"|'[^']+'|[^\s#:'"-][^:]*?):(?:\s|$)/;

const withoutQuotes = (key: string): string => key.replace(/^["']|["']$/g, '').trim().toLowerCase();

/**
 * `text` without the top-level frontmatter properties named in `keys` (compared without case, whatever their
 * quotes). A property takes its continuation lines (an indented value or list) with it. Everything else stays
 * byte for byte, line endings and byte order mark included; `text` itself comes back when it holds no such
 * property, has no frontmatter or an unclosed one.
 */
export function withoutFrontmatterKeys(text: string, keys: ReadonlySet<string>): string {
  if (keys.size === 0) return text;
  const wanted = new Set([...keys].map((key) => key.trim().toLowerCase()));
  const lines = text.split('\n');
  if (lines[0]?.replace(/^\uFEFF/, '').trimEnd() !== '---') return text;
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === '---');
  if (end < 0) return text;
  const kept: string[] = [];
  let dropping = false;
  let dropped = false;
  for (const [index, line] of lines.entries()) {
    if (index === 0 || index >= end) {
      kept.push(line);
      continue;
    }
    const key = TOP_LEVEL_KEY.exec(line)?.[1];
    if (key !== undefined) {
      dropping = wanted.has(withoutQuotes(key));
    } else if (/^\S/.test(line) && !/^-(\s|$)/.test(line)) {
      dropping = false; // a comment or a line that cannot be read at the top level
    }
    if (dropping) dropped = true;
    else kept.push(line);
  }
  return dropped ? kept.join('\n') : text;
}
