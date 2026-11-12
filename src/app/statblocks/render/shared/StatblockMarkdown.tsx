import React, { useEffect, useMemo, useRef } from 'react';
import { Component, MarkdownRenderer, type App } from 'obsidian';
import { cn } from '../../../../utils/cn';
import { linkDiceIn } from '../../../services/statblockDiceLinks';
import { decodeStatblockLinks, statblockLinksAsText } from '../../../services/statblockLinks';
import { runInBackground } from '../../../utils/backgroundTask';
import { DiceText } from './DiceText';
import { inlineMarkdown } from './inlineMarkdown';
import { followLinksIn } from './linkEvents';
import { boundedText } from '../../../creatures/statblockValues';

interface MarkdownTextProps {
  /** Raw text, which may contain markdown and wiki links */
  text: string;
  app?: App | undefined;
  sourcePath?: string | undefined;
  /** Render markdown; when false the text is shown as it reads, links as the words they show */
  markdown?: boolean | undefined;
  /** Dice notation rolls on a click; off for text that names rather than describes (an ability's name). */
  dice?: boolean | undefined;
  className?: string | undefined;
}

/**
 * The element Obsidian's Markdown is drawn into. It is inline, as are the elements a text stands
 * in, so the stylesheet sets the blocks of a text of several (`statblock.scss`): a block inside
 * an inline box loses its place in a card's columns in the Chromium of older Obsidian installers.
 */
const MARKDOWN_CLASS = 'atlas-sb-markdown';

/**
 * Statblock text. Markdown is delegated to Obsidian so wiki links, formatting
 * and embeds behave exactly as they do elsewhere in the vault.
 */
export function StatblockMarkdown({
  text: given,
  app,
  sourcePath = '',
  markdown = true,
  dice = true,
  className,
}: MarkdownTextProps): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  // Blocks join texts (a list of saves, the parts of a subheading); what reads the text on has the limit of one.
  const text = boundedText(given);
  const shownAsRead = !markdown || !app;
  const asRead = useMemo(() => (shownAsRead ? statblockLinksAsText(text) : ''), [shownAsRead, text]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !markdown || !app) return;

    el.replaceChildren();
    const component = new Component();
    runInBackground(MarkdownRenderer.render(app, inlineMarkdown(decodeStatblockLinks(text)), el, sourcePath, component), 'Rendering statblock markdown');

    // Obsidian wraps every paragraph in a <p>; the one the text starts with stays inline.
    const opening = openingParagraph(el);
    opening?.replaceWith(...Array.from(opening.childNodes));

    // Safe to rewrite: this subtree is Obsidian's markdown output, which this
    // effect rebuilds from scratch on every run. React never owns these nodes.
    if (dice) linkDiceIn(el);
    const stopLinks = followLinksIn(el, app, sourcePath);

    return () => {
      stopLinks();
      component.unload();
      el.replaceChildren();
    };
  }, [text, app, sourcePath, markdown, dice]);

  if (shownAsRead) {
    return (
      <span className={className}>
        {dice ? <DiceText text={asRead} /> : asRead}
      </span>
    );
  }

  return <span ref={ref} className={cn(MARKDOWN_CLASS, className)} />;
}

/**
 * The paragraph that runs on in the line the text stands in (after an ability's name, a value's
 * label): the text's first block, or its only paragraph. The blocks after it (further paragraphs,
 * a list) stay as Obsidian made them and stand under it (`MARKDOWN_CLASS`).
 */
function openingParagraph(el: HTMLElement): Element | null {
  const first = el.firstElementChild;
  if (first?.matches('p')) return first;
  const paragraphs = el.querySelectorAll('p');
  return paragraphs.length === 1 ? paragraphs[0] ?? null : null;
}

export default StatblockMarkdown;
