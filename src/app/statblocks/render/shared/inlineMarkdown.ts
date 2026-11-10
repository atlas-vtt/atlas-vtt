/**
 * A statblock value is inline text: a line of it that Markdown would read as
 * a block (a list item, a heading, a quote, a rule) is a value that starts
 * with that character. "-" for "none" would otherwise render as an empty
 * bullet, "1." as a numbered list. Text of several lines is left as written:
 * there a list is meant.
 */

/** A thematic break: three or more `-`, `*` or `_`, spaces between allowed. */
const RULE = /^(\s{0,3})([-*_])((?:[ \t]*\2){2,}[ \t]*)$/;
/** A bullet (`-`, `*`, `+`) or a heading's `#`s, alone or before a space. */
const BULLET_OR_HEADING = /^(\s{0,3})([-*+]|#{1,6})(?=\s|$)/;
/** A numbered list's marker: up to nine digits and `.` or `)`, alone or before a space. */
const NUMBER = /^(\s{0,3}\d{1,9})([.)])(?=\s|$)/;
const QUOTE = /^(\s{0,3})>/;

/** The text with a leading block marker escaped, so Markdown renders the line as written. */
export function inlineMarkdown(text: string): string {
  if (text.includes('\n')) return text;
  return text
    .replace(RULE, '$1\\$2$3')
    .replace(BULLET_OR_HEADING, '$1\\$2')
    .replace(NUMBER, '$1\\$2')
    .replace(QUOTE, '$1\\>');
}

/**
 * Characters that make Markdown draw text otherwise than it reads: marks
 * (`*`, `_`, `` ` ``, `~`, `=`), links and embeds (`[`, `!`, a URL), HTML
 * and entities (`<`, `&`), escapes, math, comments and tags (`\`, `$`, `%`, `#`).
 */
const MARKUP = /[*_`~=[!<&\\$%#]|:\/\//;

/** Whether Markdown would draw the text otherwise than as it reads. */
export function hasInlineMarkup(text: string): boolean {
  return MARKUP.test(text);
}
