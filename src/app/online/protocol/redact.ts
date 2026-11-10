/**
 * What error reports and logs may carry: text with every table code, key, link, address and quoted
 * piece of data taken out. Applied by the client and the companion before they send, and again by the
 * relay before it logs or stores, so a report that slipped past one side is still clean.
 *
 * A join code is six digits, which no pattern can tell from a line or column number: the page and the
 * companion, which know theirs, name it among `known`, and take it out of feedback before it is sent.
 */

/** Characters of a message kept, after redaction. */
export const MAX_REPORT_MESSAGE = 300;
/** Stack lines kept, and characters of each. */
export const MAX_STACK_LINES = 12;
export const MAX_STACK_LINE = 200;

const URL_PATTERN = /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s)'"`<>]*/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const TABLE_CODE = /(?<![A-Za-z0-9_-])[a-z2-7]{26}(?![A-Za-z0-9_-])/g;
/** Keys, secrets, player ids and other long random runs; file names of builds (`index-B3x9kLmN.js`) are shorter. */
const LONG_TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g;
const HOME = /([/\\](?:Users|home)[/\\])[^/\\\s:)]+/gi;
const DOUBLE_QUOTED = /"(?:[^"\\]|\\.)*"/g;
const BACK_QUOTED = /`(?:[^`\\]|\\.)*`/g;
const SINGLE_QUOTED = /'(?:[^'\\]|\\.)*'/g;
/** A single-quoted identifier is a property name in an engine message (`reading 'x'`), never data. */
const IDENTIFIER = /^'[A-Za-z_$][\w$]{0,40}'$/;

/** A URL without its origin, query and fragment: what a stack frame needs (`/assets/index-B3x9.js:1:20`). */
function pathOf(url: string): string {
  const rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const path = rest.replace(/[?#].*$/, '');
  return path === '' ? '/' : path;
}

/** Removes every known secret's exact text: the table code, keys, the join code, the player's own name. */
export function withoutKnown(text: string, known: readonly string[]): string {
  let out = text;
  for (const secret of known) if (secret.length >= 3) out = out.split(secret).join('‹redacted›');
  return out;
}

/** One line of text with codes, keys, links, addresses, home folders and quoted data removed. */
export function redact(text: string, known: readonly string[] = []): string {
  return withoutKnown(text, known)
    .replace(URL_PATTERN, pathOf)
    .replace(EMAIL, '‹email›')
    .replace(HOME, '$1‹user›')
    .replace(DOUBLE_QUOTED, '"…"')
    .replace(BACK_QUOTED, '`…`')
    .replace(SINGLE_QUOTED, (quoted) => (IDENTIFIER.test(quoted) ? quoted : "'…'"))
    .replace(TABLE_CODE, '‹code›')
    .replace(LONG_TOKEN, '‹token›')
    .replace(/\p{Cc}+/gu, ' ');
}

/** A message for a report: redacted and cut to `MAX_REPORT_MESSAGE` characters. */
export function reportMessage(text: string, known: readonly string[] = []): string {
  return redact(text, known).trim().slice(0, MAX_REPORT_MESSAGE);
}

/** A stack for a report: its frames (the message line dropped), redacted, at most `MAX_STACK_LINES` of `MAX_STACK_LINE` characters. */
export function reportStack(stack: string | undefined, known: readonly string[] = []): string[] {
  if (stack === undefined) return [];
  return stack.split('\n')
    .map((line) => line.trim())
    .filter((line) => /^at\s|@|^[\w$.<>]*@/.test(line) || /:\d+:\d+\)?$/.test(line))
    .slice(0, MAX_STACK_LINES)
    .map((line) => redact(line, known).slice(0, MAX_STACK_LINE));
}

/** Only the table codes of a text taken out: what feedback the user wrote keeps, but a pasted join link stops working as one. */
export function withoutTableCodes(text: string): string {
  return text.replace(TABLE_CODE, '‹code›');
}
