import '../setup/obsidianDom';
import '../../styles/main.scss';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { EncounterFolderPreview } from '../../src/app/services/EncounterFolderPreview';
import type { EncounterAsset } from '../../src/app/packages/components/asset-manager/types';
import { DASHBOARD_THEME } from './dashboardTheme';

const FOLDER = 'atlas-vtt/collections/cairn/encounters/Wilds/Forest';
const FACE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8a6"/></svg>')}`;
/** Layout rounds to fractions of a pixel. */
const SLACK = 0.5;

function encounter(name: string, faces: number, quantity?: string): EncounterAsset {
  const ref = { id: name, name, imagePath: 'face.webp', ...(quantity && { quantity }) };
  return {
    id: name, name, type: 'encounters', tags: [], modifiedAt: 0,
    tokens: Array.from({ length: faces }, () => ref),
    tokenPreviews: Array.from({ length: faces }, () => ({ url: FACE, showRing: true })),
  };
}

const ENCOUNTERS = [
  encounter('Wolf pack', 1, '1d4+1'), encounter('Bandit ambush', 3), encounter('Owlbear', 1), encounter('Lost pilgrims', 2),
  encounter('Will-o\'-wisps', 2, '2d4'), encounter('Giant spiders', 3), encounter('A very long name for a forest encounter', 2),
];

describe('the card of a pin that rolls encounters', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME;

  afterEach(() => {
    document.body.empty();
    style.remove();
  });

  it.each(['theme-light', 'theme-dark'])('keeps one inset for padding, gaps and its corners (%s)', async (theme) => {
    document.head.append(style);
    document.body.className = theme;
    new EncounterFolderPreview({
      folder: FOLDER, encounters: ENCOUNTERS, pin: { id: 'p', kind: 'pin', x: 0, y: 0, notePath: FOLDER },
      position: { x: 40, y: 40 }, doc: document, roll: () => undefined, place: () => undefined, onClosed: () => undefined,
    });
    const card = document.querySelector<HTMLElement>('.atlas-encounter-folder-preview')!;
    await Promise.all(card.getAnimations().map((animation) => animation.finished));
    const box = card.getBoundingClientRect();
    const part = (cls: string): DOMRect => card.querySelector(`.atlas-encounter-folder-preview__${cls}`)!.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(card).borderTopWidth);
    const inset = parseFloat(getComputedStyle(card).paddingTop);

    const header = part('header');
    const list = part('list');
    const roll = part('roll');
    expect(header.top - box.top - border).toBeCloseTo(inset, 0);
    expect(list.top - header.bottom).toBeCloseTo(inset, 0);
    expect(roll.top - list.bottom).toBeCloseTo(inset, 0);
    expect(box.bottom - border - roll.bottom).toBeCloseTo(inset, 0);

    // The roll button's lower corners run concentric with the card's
    const inner = parseFloat(getComputedStyle(card).borderBottomLeftRadius) - border;
    const button = card.querySelector<HTMLElement>('.atlas-encounter-folder-preview__roll')!;
    // A border of 1.5 px is drawn whole, so the two radii may differ by that half pixel
    expect(Math.abs(parseFloat(getComputedStyle(button).borderBottomLeftRadius) - (inner - inset))).toBeLessThanOrEqual(SLACK);

    // Seven encounters scroll inside the list, which keeps its rows whole
    const listEl = card.querySelector<HTMLElement>('.atlas-encounter-folder-preview__list')!;
    expect(listEl.scrollHeight).toBeGreaterThan(listEl.clientHeight);
    const name = card.querySelector<HTMLElement>('.atlas-encounter-folder-preview__row:last-child .atlas-encounter-folder-preview__row-name')!;
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);

    await page.screenshot({ path: `__screenshots__/encounter-folder-card-${theme}.png`, element: card });
  });
});
