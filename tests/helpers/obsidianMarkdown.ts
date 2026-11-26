import { MarkdownRenderer } from 'obsidian';
import { vi } from 'vitest';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/;

/** One line's inline Markdown as Obsidian's renderer draws it: strong, emphasis, wiki links and web links. */
function drawInline(parent: HTMLElement, text: string): void {
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    if (part.startsWith('**')) parent.createEl('strong', { text: part.slice(2, -2) });
    else if (part.startsWith('[[')) {
      const target = part.slice(2, -2);
      parent.createEl('a', { text: target, cls: 'internal-link', attr: { 'data-href': target, href: target, target: '_blank', rel: 'noopener nofollow' } });
    } else if (part.startsWith('[')) {
      const [, label = '', href = ''] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part) ?? [];
      parent.createEl('a', { text: label, cls: 'external-link', attr: { href, target: '_blank', rel: 'noopener nofollow' } });
    } else if (part.startsWith('*')) parent.createEl('em', { text: part.slice(1, -1) });
    else parent.appendText(part);
  }
}

/**
 * Draws Markdown into `el` in the elements Obsidian's renderer makes of it: a paragraph per stretch of
 * lines (`dir="auto"`, lines broken with `<br>`), a list for lines that start with `- `, and inline
 * strong, emphasis and links (`internal-link` with `data-href`, `external-link`).
 */
export function drawObsidianMarkdown(markdown: string, el: HTMLElement): void {
  let list: HTMLElement | null = null;
  let paragraph: HTMLElement | null = null;
  for (const line of markdown.split('\n')) {
    if (line.trim() === '') {
      list = null;
      paragraph = null;
    } else if (line.startsWith('- ')) {
      paragraph = null;
      list ??= el.createEl('ul');
      drawInline(list.createEl('li', { attr: { dir: 'auto' } }), line.slice(2));
    } else {
      list = null;
      if (paragraph) paragraph.createEl('br');
      paragraph ??= el.createEl('p', { attr: { dir: 'auto' } });
      drawInline(paragraph, line);
    }
  }
}

/** Makes Obsidian's renderer draw as `drawObsidianMarkdown` until the mocks are restored. */
export function renderObsidianMarkdown(): void {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_app, markdown, el) => {
    drawObsidianMarkdown(markdown, el);
    return Promise.resolve();
  });
}
