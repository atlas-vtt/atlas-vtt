import React from 'react';
import { createRoot } from 'react-dom/client';
import type { App } from 'obsidian';
import { sampleRecord } from '../../../statblocks/model/sampleValues';
import type { StatblockTemplate } from '../../../statblocks/model/templateTypes';
import { StatblockSheet } from '../../../statblocks/render/StatblockSheet';
import { STATBLOCK_FEED_MAX_WIDTH } from '../../../statblocks/render/statblockSurfaceWidths';
import { documentCss, elementPicture } from './elementPicture';
import './card-picture.scss';

/** A template's card as its listing page shows it, PNG in Obsidian's light and dark look. */
export interface CardPictures {
  light: ArrayBuffer;
  dark: ArrayBuffer;
}

const DEFAULT_COLUMN_WIDTH_EM = 22;
/** Each column a fifth wider than the least it takes, as a note panel usually gives it: tables keep inside their column. */
const COLUMN_ROOM = 1.2;
/** The gap between the card's columns, in CSS pixels (`$spacing-l`, statblock-sheet.scss). */
const COLUMN_GAP = 16;
/** Device pixels per CSS pixel, so the text stays sharp on a high-density screen. */
const SCALE = 2;
/** The tallest picture in device pixels: a longer card is drawn at fewer pixels per CSS pixel. */
const MAX_HEIGHT = 12_000;
/**
 * Room below the card as measured here: the picture is drawn with Obsidian's own theme, whose type may set the card
 * taller than the vault's theme does, and is cut where the card ends.
 */
const SLACK = 1.25;
/** Long enough for the sample text Obsidian renders as Markdown to stand in the card. */
const SETTLE_MS = 150;

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * The card's width: one column as wide as the DM screen's widest feed, more as wide as their columns need, with
 * `around` (what the card's frame and padding take beside the columns) on top.
 */
function cardWidth(template: StatblockTemplate, fontSize: number, around: number): number {
  const { maxColumns, columnWidth = DEFAULT_COLUMN_WIDTH_EM } = template.layout;
  if (maxColumns === 1) return STATBLOCK_FEED_MAX_WIDTH;
  return Math.ceil(around + maxColumns * columnWidth * fontSize * COLUMN_ROOM + (maxColumns - 1) * COLUMN_GAP);
}

/** The classes of Obsidian's `<body>` in `look`, without the vault's own. */
function bodyClass(body: HTMLElement, look: 'light' | 'dark'): string {
  const kept = Array.from(body.classList).filter((name) => name !== 'theme-light' && name !== 'theme-dark');
  return [...kept, `theme-${look}`].join(' ');
}

/**
 * Draws `template`'s card with the samples the template editor shows (`sampleRecord`), named `name`, in Obsidian's
 * light and dark look without the vault's theme or snippets, so every listing shows its card alike. The card is
 * rendered off screen and taken away again; rejects where the browser cannot draw the picture.
 */
export async function templateCardPictures(app: App, template: StatblockTemplate, name: string): Promise<CardPictures> {
  const doc = activeDocument;
  const host = doc.body.createDiv({ cls: 'atlas-card-picture-host' });
  const card = host.createDiv({ cls: 'atlas-vtt-plugin atlas-card-picture' });
  const root = createRoot(card);
  try {
    root.render(<StatblockSheet template={template} name={name} fields={{ ...sampleRecord(template), name }} variant="full" app={app} rollBonuses="preview" />);
    await doc.fonts.ready;
    await wait(SETTLE_MS);
    const columns = card.querySelector('.atlas-sb-columns');
    if (!columns) throw new Error('The card was not rendered');
    const fontSize = parseFloat(activeWindow.getComputedStyle(columns).fontSize);
    const width = cardWidth(template, fontSize, card.getBoundingClientRect().width - columns.getBoundingClientRect().width);
    card.setCssProps({ '--atlas-card-picture-width': `${width}px` });
    const height = Math.ceil(card.getBoundingClientRect().height * SLACK);
    const scale = Math.min(SCALE, MAX_HEIGHT / height);
    const skip = new Set<Node>([app.customCss?.styleEl, ...(app.customCss?.extraStyleEls ?? [])].filter((node): node is HTMLStyleElement => node != null));
    const css = documentCss(doc, skip);
    const draw = async (look: 'light' | 'dark'): Promise<ArrayBuffer> =>
      (await elementPicture(card, { css, bodyClass: bodyClass(doc.body, look), width, height, scale })).arrayBuffer();
    return { light: await draw('light'), dark: await draw('dark') };
  } finally {
    root.unmount();
    host.remove();
  }
}
