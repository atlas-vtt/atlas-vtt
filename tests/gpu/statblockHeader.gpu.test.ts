import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { setHeaderPartHidden } from '../../src/app/statblocks/model/templateHeader';
import type { HeaderPartId, StatblockTemplate, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { template } from '../unit/statblocks/template-editor/editorKit';
import { THEME, frames, px } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose Node `events` has no browser build.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const TOLERANCE = 0.5;
const ART = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#5a7d4f"/></svg>')}`;
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
  { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
  { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
  { key: 'description', label: 'Description', type: 'markdown' },
  { key: 'ac', label: 'Armor Class', type: 'number' },
];
const VALUES = {
  name: 'Marsh Warden', image: ART, level: 3, type: 'Plant', hp: 45, ac: 14,
  description: 'The wardens grow where the old causeway sank, and they remember it.',
};
const TEMPLATE = template([{ id: 'statac01', type: 'stat', field: 'ac', look: 'run-in' }], FIELDS);
const h = React.createElement;

function hiding(...parts: HeaderPartId[]): StatblockTemplate {
  return parts.reduce((current, part) => setHeaderPartHidden(current, part, true), TEMPLATE);
}

async function drawn(shown: StatblockTemplate): Promise<HTMLElement> {
  const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  host.style.width = '480px';
  render(h(StatblockSheet, { template: shown, name: 'Header', fields: VALUES, variant: 'full' }), { container: host });
  await act(async () => { await frames(2); });
  return host.querySelector<HTMLElement>('.atlas-sb-header')!;
}

const part = (header: Element, id: string): DOMRect => header.querySelector(`[data-block-id="${id}"]`)!.getBoundingClientRect();

/**
 * The header every statblock has, with the real stylesheet: the token art at
 * the right across the header's height, at the left the name over the line
 * with the level and the type, then the hit points and the description, one
 * gap apart; a hidden part leaves no room behind.
 */
describe('the statblock header', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(async () => {
    await page.viewport(800, 600);
    document.head.append(style);
  });
  afterEach(() => {
    cleanup();
    style.remove();
    document.body.replaceChildren();
  });

  it('stands the token art at the right and the name, its line, the hit points and the description at the left, top to bottom', async () => {
    const header = await drawn(TEMPLATE);
    const box = header.getBoundingClientRect();
    const [name, level, type, hp, description, token] = ['header-name', 'header-level', 'header-type', 'header-hp', 'header-description', 'header-token']
      .map((id) => part(header, id));
    expect(Math.abs(token!.right - box.right)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(token!.top - box.top)).toBeLessThanOrEqual(TOLERANCE);
    for (const left of [name!, hp!, description!]) {
      expect(Math.abs(left.left - box.left)).toBeLessThanOrEqual(TOLERANCE);
      expect(left.right).toBeLessThanOrEqual(token!.left);
    }
    expect(Math.abs(name!.top - box.top)).toBeLessThanOrEqual(TOLERANCE);
    // The level and the type share the line under the name.
    expect(Math.abs(level!.top - type!.top)).toBeLessThanOrEqual(2);
    expect(type!.left).toBeGreaterThan(level!.right);
    expect(level!.top).toBeGreaterThanOrEqual(name!.bottom);
    expect(hp!.top).toBeGreaterThanOrEqual(level!.bottom);
    expect(description!.top).toBeGreaterThanOrEqual(hp!.bottom);
    // The blocks the template lays out stand below the whole header.
    const columns = header.nextElementSibling!.getBoundingClientRect();
    expect(columns.top).toBeGreaterThanOrEqual(Math.max(description!.bottom, token!.bottom));
  });

  it('leaves no gap where a hidden part would stand', async () => {
    const whole = await drawn(TEMPLATE);
    const gap = px(getComputedStyle(whole.querySelector('.atlas-sb-header__text')!).rowGap);
    const hpAfterLine = part(whole, 'header-hp').top - whole.querySelector('.atlas-sb-header__heading')!.getBoundingClientRect().bottom;
    expect(Math.abs(hpAfterLine - gap)).toBeLessThanOrEqual(TOLERANCE);
    cleanup();
    document.body.replaceChildren();

    const header = await drawn(hiding('level', 'type', 'description'));
    expect(header.querySelector('.atlas-sb-header__subtitle')).toBeNull();
    expect(header.querySelector('[data-block-id="header-description"]')).toBeNull();
    const name = part(header, 'header-name');
    const hp = part(header, 'header-hp');
    expect(Math.abs(hp.top - name.bottom - gap)).toBeLessThanOrEqual(TOLERANCE);
    const text = header.querySelector('.atlas-sb-header__text')!.getBoundingClientRect();
    expect(Math.abs(text.bottom - hp.bottom)).toBeLessThanOrEqual(TOLERANCE);
  });
});
