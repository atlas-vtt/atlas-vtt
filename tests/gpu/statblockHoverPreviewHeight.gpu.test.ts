import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import hoverPreviewCss from '../../src/app/react/components/statblock-hover-preview.scss?inline';
import { StatblockHoverPreview } from '../../src/app/react/components/StatblockHoverPreview';
import { PREVIEW_GAP_BLOCK } from '../../src/app/react/components/statblock/previewEdgeGap';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { addNote, creatureVault, type CreatureVault } from '../mocks/creatureVault';
import { renderObsidianBlocks } from '../unit/statblocks/render/obsidianBlocks';
import { THEME, frames } from './sidePanesHarness';

// The roll's way to a map reaches the map view, whose Node `events` has no browser build; nothing here rolls.
vi.mock('../../src/app/services/statblockRolls', () => ({ rollStatblockDice: () => null, statblockRollingDice: () => null }));
vi.mock('../../src/app/services/statblockHitPoints', () => ({ rollHitPoints: () => undefined }));
// A vault answers after a moment: the preview is laid out and drawn with its skeleton before the statblock is there.
const note = vi.hoisted(() => ({ read: Promise.resolve() }));
vi.mock('../../src/app/statblocks/resolve/resolveStatblock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/statblocks/resolve/resolveStatblock')>();
  const resolveStatblock: typeof actual.resolveStatblock = async (...args) => {
    await note.read;
    return actual.resolveStatblock(...args);
  };
  return { ...actual, resolveStatblock };
});

const NOTE = 'Bestiary/Warden.md';
const WINDOW = { width: 1280, height: 800 };
/** The room the preview keeps to the window's edges where no theme asks for more. */
const EDGE = 16;
const h = React.createElement;

const entries = (count: number, name: string): { name: string; desc: string }[] => Array.from({ length: count }, (_, index) => ({
  name: `${name} ${index + 1}.`,
  desc: 'The warden wades out of the reeds and drags one creature within reach under the water until it breaks free.',
}));

/** A statblock of `traits` abilities and one last action, which is the end of its card. */
function statblock(traits: number): Record<string, unknown> {
  return {
    statblock: true,
    'atlas-template': 'builtin:generic-creature',
    name: 'Marsh Warden',
    level: 4,
    senses: 'darkvision 60 ft.',
    traits: entries(traits, 'Trait'),
    actions: [{ name: 'Last action.', desc: 'Melee attack: 1d8 piercing damage.' }],
  };
}

/** An initiative card the preview is opened for, `fromBottom` px above the window's lower edge. */
const cardAt = (fromBottom: number): DOMRect => new DOMRect(WINDOW.width - 120, WINDOW.height - fromBottom - 72, 96, 72);

interface Shown {
  box: DOMRect;
  body: HTMLElement;
  /** The height the whole statblock takes where nothing limits it. */
  whole: number;
  /** The heights the preview had as it changed size, and how far down it reached in the frame of each change. */
  sizes: { height: number; bottom: number }[];
}

/**
 * Report #720: the hover preview of the initiative tracker took its height
 * limit from the room under its own top, and its top from its own height. For
 * a card low in the window it was placed against the lower edge while it still
 * showed its skeleton, the limit was then the skeleton's height, and the
 * statblock that arrived was cut to it (a 552 px body in a 307 px box) however
 * much room the window had above. With the real stylesheet the preview is as
 * tall as its statblock wherever the window holds it, stands inside the
 * window, and scrolls inside only when the statblock is taller than the window.
 */
describe('the statblock hover preview of a card low in the window', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css + hoverPreviewCss;
  let vault: CreatureVault;

  beforeEach(async () => {
    await page.viewport(WINDOW.width, WINDOW.height);
    document.head.append(style);
    renderObsidianBlocks();
    vault = creatureVault();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    TemplateLibrary.release(vault.app);
    style.remove();
    document.body.style.removeProperty(PREVIEW_GAP_BLOCK);
    document.body.replaceChildren();
  });

  async function show(traits: number, anchorRect: DOMRect | null, position: { x: number; y: number } | null = null): Promise<Shown> {
    addNote(vault, NOTE, statblock(traits));
    note.read = frames(3);
    render(h(StatblockHoverPreview, { app: vault.app, notePath: NOTE, isVisible: true, isClosing: false, position, anchorRect, preferredSide: 'left' }));
    const preview = document.querySelector<HTMLElement>('.statblock-hover-preview')!;
    // Observers hear of a change in the order they were made: this one reads the frame as the preview's own left it.
    const sizes: Shown['sizes'] = [];
    // In layout pixels, since the preview is scaled while it fades in.
    const observer = new ResizeObserver(() => sizes.push({ height: preview.offsetHeight, bottom: preview.offsetTop + preview.offsetHeight }));
    observer.observe(preview);
    await frames(1);
    // The skeleton shows first, as in the app; the statblock takes its place.
    expect(preview.querySelector('.atlas-statblock-skeleton')).not.toBeNull();
    await vi.waitFor(() => expect(preview.querySelector('[data-prop="actions"] .atlas-sb-trait')).not.toBeNull());
    await frames(6);
    observer.disconnect();
    // It fades in a little smaller than it is; measured once that is over.
    await Promise.all(preview.getAnimations().map((animation) => animation.finished));
    const body = preview.querySelector<HTMLElement>('.atlas-statblock-body')!;
    const box = preview.getBoundingClientRect();
    return { box, body, whole: box.height + body.scrollHeight - body.clientHeight, sizes };
  }

  function expectInside(box: DOMRect, edge: number): void {
    expect(box.top).toBeGreaterThanOrEqual(edge - 0.5);
    expect(box.bottom).toBeLessThanOrEqual(WINDOW.height - edge + 0.5);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(WINDOW.width);
  }

  it('shows a statblock the window holds whole, moved up from its card', async () => {
    const { box, body, whole } = await show(6, cardAt(8));
    // Taller than the skeleton, shorter than the window.
    expect(whole).toBeGreaterThan(450);
    expect(whole).toBeLessThan(WINDOW.height - 2 * EDGE);
    expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
    expect(box.height).toBeCloseTo(whole, 0);
    expectInside(box, EDGE);
    // Against the lower edge: as near its card as the window lets it.
    expect(box.bottom).toBeGreaterThan(WINDOW.height - EDGE - 1);
  });

  it('is never drawn over the window\'s edge while the statblock takes the skeleton\'s place', async () => {
    const { sizes, whole } = await show(6, cardAt(8));
    // It grew: first the skeleton's height, then the statblock's.
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    expect(sizes[0]!.height).toBeLessThan(whole - 100);
    expect(Math.abs(sizes.at(-1)!.height - whole)).toBeLessThan(1);
    for (const { bottom } of sizes) expect(bottom).toBeLessThanOrEqual(WINDOW.height - EDGE + 1);
  });

  it('shows the same for a preview opened at a point', async () => {
    const { box, body, whole } = await show(6, null, { x: 900, y: WINDOW.height - 20 });
    expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
    expect(box.height).toBeCloseTo(whole, 0);
    expectInside(box, EDGE);
  });

  it('fills the window and scrolls inside where the statblock is taller than the window', async () => {
    const { box, body, whole } = await show(24, cardAt(8));
    expect(whole).toBeGreaterThan(WINDOW.height);
    expect(box.height).toBeCloseTo(WINDOW.height - 2 * EDGE, 0);
    expectInside(box, EDGE);

    // The rest is reached by scrolling the card's body, down to its last entry.
    expect(getComputedStyle(body).overflowY).toBe('auto');
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    body.scrollTop = body.scrollHeight;
    await frames(2);
    const last = [...body.querySelectorAll<HTMLElement>('[data-prop="actions"] .atlas-sb-trait')].at(-1)!.getBoundingClientRect();
    const view = body.getBoundingClientRect();
    expect(last.top).toBeGreaterThanOrEqual(view.top);
    expect(last.bottom).toBeLessThanOrEqual(view.bottom + 0.5);
    expect(view.bottom).toBeLessThanOrEqual(box.bottom);
  });

  it('keeps the room a theme asks for at the window\'s edges, and fills what is left', async () => {
    document.body.style.setProperty(PREVIEW_GAP_BLOCK, '60px');
    const { box, body } = await show(24, cardAt(8));
    expect(box.height).toBeCloseTo(WINDOW.height - 2 * 60, 0);
    expectInside(box, 60);
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  });

  it('stays beside a card in the middle of the window', async () => {
    const card = cardAt(360);
    const { box, body, whole } = await show(6, card);
    expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
    expect(box.height).toBeCloseTo(whole, 0);
    expectInside(box, EDGE);
    // Centred on its card while the window has the room.
    expect(box.top + box.height / 2).toBeCloseTo(card.top + card.height / 2, 0);
  });
});
