import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { ResourcesTab } from '../../src/app/react/components/collection-settings/ResourcesTab';
import { HP_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import { SettingsContent } from '../../src/app/react/components/collection-settings/SettingsContent';

/**
 * The Resources tab as the collection settings dialog shows it, styled by the plugin's real
 * stylesheet. Obsidian gives every button and input its corner shape (a superellipse on
 * macOS), which the theme below does too.
 */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626; --background-modifier-border: #363636;
    --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --interactive-accent: #7f6df2; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px;
    --corner-shape: squircle; }
  /* Obsidian's own button look: its corner shape and a fixed height */
  button, input { corner-shape: var(--corner-shape); }
  button { height: 30px; }
`;
// Exercise a real gutter on platforms whose native scrollbars otherwise overlay the content.
const CLASSIC_SCROLLBAR = `
  .atlas-vtt-plugin .atlas-collection-settings-content { scrollbar-width: auto; scrollbar-color: auto; }
  .atlas-vtt-plugin .atlas-collection-settings-content::-webkit-scrollbar { width: 8px; height: 8px; }
`;
const NAMES = ['HP', 'STR', 'Ammo', 'Luck', 'Mana', 'Grit'];
const h = React.createElement;

function Dialog(): React.ReactElement {
  const [resources, setResources] = useState<ResourceDefinition[]>(
    NAMES.map((name, slot) => ({ ...HP_RESOURCE, key: name.toLowerCase(), name, slot })));
  return h('div', { className: 'atlas-vtt-plugin' },
    h('div', { className: 'atlas-collection-settings-modal' },
      h('div', { className: 'atlas-collection-settings-header' }, h('h3', null, 'Collection Settings')),
      h('div', { className: 'atlas-collection-settings-body' },
        h('div', { className: 'atlas-collection-settings-sidebar' }),
        h(SettingsContent, null,
          h(ResourcesTab, { resources, onChange: setResources, fieldSuggestions: ['hp', 'ammo'] }))),
      h('div', { className: 'atlas-collection-settings-footer' }, h('button', null, 'Cancel'), h('button', null, 'Save'))));
}

describe('the socket editor of the Resources tab', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css + CLASSIC_SCROLLBAR;

  beforeEach(async () => {
    await page.viewport(760, 860);
    document.head.append(style);
    render(h(Dialog));
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it.each(NAMES)('shows the whole fan of %s inside the picture of the token', async (name) => {
    await userEvent.click(page.getByRole('button', { name: new RegExp(`^${name}: `) }));
    // The buttons travel from the socket to their places
    await new Promise((resolve) => setTimeout(resolve, 600));
    const stage = document.querySelector('.atlas-csm-token-stage')!.getBoundingClientRect();
    const items = [...document.querySelectorAll('.atlas-csm-fan__item')].map((item) => item.getBoundingClientRect());
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.top).toBeGreaterThanOrEqual(stage.top);
      expect(item.bottom).toBeLessThanOrEqual(stage.bottom);
      expect(item.left).toBeGreaterThanOrEqual(stage.left);
      expect(item.right).toBeLessThanOrEqual(stage.right);
    }
  });

  it('lays the twenty colours out in two rows of ten, centred and inside the card', async () => {
    await userEvent.click(page.getByRole('button', { name: /^HP: / }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const card = document.querySelector('.atlas-csm-resource-card')!.getBoundingClientRect();
    const swatches = [...document.querySelectorAll('.atlas-csm-resource-card .atlas-swatch')].map((swatch) => swatch.getBoundingClientRect());
    expect(swatches).toHaveLength(20);
    for (const swatch of swatches) {
      expect(swatch.left).toBeGreaterThanOrEqual(card.left);
      expect(swatch.right).toBeLessThanOrEqual(card.right);
      expect(swatch.width).toBeCloseTo(swatch.height, 0);
    }
    const rows = [...new Set(swatches.map((swatch) => Math.round(swatch.top)))];
    expect(rows).toHaveLength(2);
    expect(swatches.filter((swatch) => Math.round(swatch.top) === rows[0]).length).toBe(10);
    // Centred: as much room left of the first swatch as right of the tenth
    const [first, tenth] = [swatches[0]!, swatches[9]!];
    expect(first.left - card.left).toBeCloseTo(card.right - tenth.right, 0);
  });

  it('fits the dialog with a card open: the tab does not scroll', async () => {
    await userEvent.click(page.getByRole('button', { name: /^HP: / }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const content = document.querySelector('.atlas-collection-settings-content')!;
    expect(content.scrollHeight).toBeLessThanOrEqual(content.clientHeight);
  });

  it('lets the name and the statblock field take a click: nothing lies over the card', async () => {
    await userEvent.click(page.getByRole('button', { name: /^HP: / }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const label of ['Name', 'Statblock field']) {
      const input = page.getByRole('textbox', { name: label }).element();
      const box = input.getBoundingClientRect();
      expect(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)).toBe(input);
    }
    await userEvent.click(page.getByRole('textbox', { name: 'Name' }));
    await userEvent.keyboard('!');
    expect((page.getByRole('textbox', { name: 'Name' }).element() as HTMLInputElement).value).toBe('HP!');
  });

  it('keeps the fan\'s buttons and the field chips round where Obsidian shapes buttons as squircles', async () => {
    if (!CSS.supports('corner-shape', 'round')) return;
    const shapeOf = (element: Element): string => getComputedStyle(element).getPropertyValue('corner-shape');
    const reference = document.body.createDiv();
    reference.style.setProperty('corner-shape', 'round');
    const round = shapeOf(reference);
    // The theme's shape does reach buttons that do not say otherwise
    expect(shapeOf(page.getByRole('button', { name: /^HP: / }).element())).not.toBe(round);

    await userEvent.click(page.getByRole('button', { name: /^HP: / }));
    const controls = [...document.querySelectorAll('.atlas-csm-fan__button, .atlas-csm-field-chip')];
    // Four in the fan and the two field chips of the card
    expect(controls).toHaveLength(6);
    for (const control of controls) expect(shapeOf(control)).toBe(round);
    reference.remove();
  });

  it('keeps everything in place when the scrollbar appears, with equal room on both sides', async () => {
    const content = document.querySelector<HTMLElement>('.atlas-collection-settings-content')!;
    const stage = document.querySelector('.atlas-csm-token-stage')!;
    const before = stage.getBoundingClientRect();
    expect(content.scrollHeight).toBeLessThanOrEqual(content.clientHeight);

    content.createDiv().style.minHeight = '2000px';
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    // The scrollbar takes room here, as in Obsidian: a hidden one would prove nothing
    expect(content.offsetWidth).toBeGreaterThan(content.clientWidth);
    const after = stage.getBoundingClientRect();
    expect(after.left).toBe(before.left);
    expect(after.width).toBe(before.width);

    const box = content.getBoundingClientRect();
    expect(after.left - box.left).toBeCloseTo(box.right - after.right, 0);
  });
});
