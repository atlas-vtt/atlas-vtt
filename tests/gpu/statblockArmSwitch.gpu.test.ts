import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateBlock, type TemplateField } from '../../src/app/statblocks/model/templateTypes';

// Dice links reach the map view, whose services need Node's `events`; nothing here rolls dice.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
  splitDiceSegments: (text: string) => [{ text, dice: false }],
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const THEME = `body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --font-ui-smaller: 12px;
  --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --font-semibold: 600; --font-bold: 700; --line-height-tight: 1.2;
  --radius-m: 8px; --background-modifier-border: rgb(120, 120, 120); --interactive-accent: rgb(80, 120, 220);
  --background-primary: white; --background-secondary-alt: rgb(230, 230, 230); }`;

const APP = { workspace: { getLeavesOfType: () => [] }, vault: { getFileByPath: () => null }, metadataCache: {} } as unknown as App;

const number = (key: string, label: string): TemplateField => ({ key, label, type: 'number' });

const FIELDS: TemplateField[] = [
  number('proficiency', 'Proficiency'), number('armor', 'Armor'), number('evasion', 'Evasion'), number('agility', 'Agility'),
  number('stress', 'Stress'), number('hope', 'Hope'), number('level', 'Level'), number('tier', 'Tier'),
  { key: 'experiences', label: 'Experiences', type: 'pairs' }, { key: 'saves', label: 'Saves', type: 'pairs' },
];
/** Each block that adds to rolls beside the same block without, so their boxes compare. */
const BLOCKS: TemplateBlock[] = [
  { id: 'armed001', type: 'stat', field: 'proficiency', look: 'run-in', addsToRolls: true },
  { id: 'plain001', type: 'stat', field: 'armor', look: 'run-in' },
  { id: 'armed002', type: 'stat', field: 'level', look: 'stacked', addsToRolls: true },
  { id: 'plain002', type: 'stat', field: 'tier', look: 'stacked' },
  { id: 'armed003', type: 'pairs', field: 'experiences', display: 'signed', addsToRolls: true },
  { id: 'plain003', type: 'pairs', field: 'saves', display: 'signed' },
  { id: 'armed004', type: 'metric', fields: ['evasion', 'agility'], addsToRolls: true },
  { id: 'plain004', type: 'metric', fields: ['stress', 'hope'] },
];
const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT, version: 1, id: 'arm-switch-abc123', fields: FIELDS, layout: { maxColumns: 1, blocks: BLOCKS },
};
const VALUES = {
  proficiency: 2, armor: 3, level: 4, tier: 2, evasion: 10, agility: 1, stress: 6, hope: 2,
  experiences: [{ Survival: 2 }, { Stealth: 1 }], saves: [{ Dex: 2 }, { Wis: 1 }],
};

const frame = (root: Element, id: string): HTMLElement => {
  const element = root.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
  if (!element) throw new Error(`No block ${id}`);
  return element;
};
const rect = (element: Element): DOMRect => element.getBoundingClientRect();
const switches = (root: Element): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.atlas-sb-arm .atlas-toggle__switch')];

/**
 * "Add to next roll" puts a small switch after a value. It must sit in the
 * value's line without making it taller, centred on the number, and keep the
 * pill and its thumb concentric, also where the card is drawn outside Atlas'
 * own root (the hover preview, portalled to the body).
 */
describe('the Add to next roll switch in the real stylesheet', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1000, 900);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const sheet = (sourcePath: string): React.ReactElement =>
    React.createElement(StatblockSheet, { template: TEMPLATE, name: 'Arm', fields: VALUES, variant: 'feed', app: APP, sourcePath });

  it('leaves every line, a stacked value, a Metric and a list of pairs as tall as without it', () => {
    const { container } = render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 380, padding: 16 } }, sheet('A.md')));
    expect(switches(container)).toHaveLength(6);
    for (const [armed, plain] of [['armed001', 'plain001'], ['armed002', 'plain002'], ['armed003', 'plain003'], ['armed004', 'plain004']] as const) {
      expect(rect(frame(container, armed)).height, armed).toBeCloseTo(rect(frame(container, plain)).height, 0);
    }
  });

  it('sits after its number, centred on it, a 28 × 16 pill whose thumb keeps 2 px all round', () => {
    const { container } = render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 380, padding: 16 } }, sheet('B.md')));
    for (const id of ['armed001', 'armed002', 'armed004']) {
      const block = frame(container, id);
      const value = rect(block.querySelector('.atlas-sb-value')!);
      const pill = block.querySelector<HTMLElement>('.atlas-sb-arm .atlas-toggle__switch')!;
      const box = rect(pill);
      expect([box.width, box.height], id).toEqual([28, 16]);
      expect(box.left - value.right, id).toBeCloseTo(4, 0);
      expect((box.top + box.bottom) / 2, id).toBeCloseTo((value.top + value.bottom) / 2, 0);
      const thumb = rect(pill.querySelector('.atlas-toggle__thumb')!);
      expect([thumb.left - box.left, thumb.top - box.top, box.bottom - thumb.bottom], id).toEqual([2, 2, 2]);
      expect(getComputedStyle(pill).borderTopLeftRadius).toBe(getComputedStyle(pill.parentElement!).borderTopLeftRadius);
    }
  });

  it('keeps its look on a card outside Atlas\' root, as the hover preview draws it', () => {
    const { container } = render(React.createElement('div', { style: { width: 380, padding: 16 } }, sheet('C.md')));
    const box = rect(switches(container)[0]!);
    expect([box.width, box.height]).toEqual([28, 16]);
    expect(getComputedStyle(switches(container)[0]!).borderTopWidth).toBe('1px');
  });
});
