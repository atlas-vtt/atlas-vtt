import { MarkdownRenderer } from 'obsidian';
import { vi } from 'vitest';

/**
 * Draws Markdown into `el` in the blocks Obsidian's renderer makes of it: a
 * paragraph per stretch of lines (its lines broken with `<br>`), a list for
 * lines that start with `- `, and `*emphasis*`. Enough to see what a text of
 * several blocks becomes; the inline Markdown of one line is
 * `inlineMarkdownValues.test.tsx`'s.
 */
export function drawObsidianBlocks(markdown: string, el: HTMLElement): void {
  let list: HTMLElement | null = null;
  let paragraph: HTMLElement | null = null;
  const inline = (parent: HTMLElement, text: string): void => {
    for (const [index, part] of text.split(/\*([^*]+)\*/).entries()) {
      if (index % 2 === 1) parent.createEl('em', { text: part });
      else if (part) parent.appendText(part);
    }
  };
  for (const line of markdown.split('\n')) {
    if (line.trim() === '') {
      list = null;
      paragraph = null;
    } else if (line.startsWith('- ')) {
      paragraph = null;
      list ??= el.createEl('ul');
      inline(list.createEl('li', { attr: { dir: 'auto' } }), line.slice(2));
    } else {
      list = null;
      if (paragraph) paragraph.createEl('br');
      paragraph ??= el.createEl('p', { attr: { dir: 'auto' } });
      inline(paragraph, line);
    }
  }
}

/** Makes Obsidian's renderer draw blocks (`drawObsidianBlocks`) until the mocks are restored. */
export function renderObsidianBlocks(): void {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_app, markdown, el) => {
    drawObsidianBlocks(markdown, el);
    return Promise.resolve();
  });
}
