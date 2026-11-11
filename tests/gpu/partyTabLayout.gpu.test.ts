import '../setup/obsidianDom';
import React from 'react';
import { act } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import css from '../../styles/main.scss?inline';
import { PartyTab } from '../../src/app/react/components/collection-settings/PartyTab';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** Obsidian's theme variables the settings read, as in the other layout tests. */
const THEME = `
  body { margin: 0; font: 13px/1.5 sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626; --background-modifier-border: #363636;
    --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #888; --interactive-accent: #7f6df2; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px; }
  button, input { font: inherit; }
`;
const LONG_NAME = 'party/portraits/a-very-long-portrait-file-name-that-goes-on-and-on-for-the-whole-width-of-the-settings.webp';

describe('the party tab', () => {
  let root: Root | null = null;
  const style = document.createElement('style');
  style.textContent = THEME + css;
  afterEach(() => { act(() => root?.unmount()); root = null; document.body.replaceChildren(); style.remove(); });

  it('keeps a player\'s picture picker inside the list, its thumbnails square', async () => {
    document.head.append(style);
    const { app } = createInMemoryApp({ files: { [LONG_NAME]: '' } });
    const host = document.body.appendChild(document.createElement('div'));
    host.className = 'atlas-vtt-plugin';
    host.style.width = '480px';
    root = createRoot(host);
    act(() => root!.render(React.createElement(PartyTab, { app, party: [{ id: 'ara', name: 'Ara' }], onChange: () => undefined, enemyImagePath: '', onEnemyImageChange: () => undefined })));

    act(() => host.querySelector<HTMLButtonElement>('.atlas-csm-party-picture')!.click());
    const list = host.querySelector('.atlas-csm-party-list')!.getBoundingClientRect();
    const picker = host.querySelector('.atlas-csm-party-picker');
    expect(picker).not.toBeNull();
    // The picture offered as a thumbnail, named for screen readers and in its tooltip
    const choice = host.querySelector(`[aria-label="${LONG_NAME.split('/').pop()!.replace('.webp', '')}"]`);
    expect(choice).not.toBeNull();
    const cell = choice!.getBoundingClientRect();
    expect(cell.right).toBeLessThanOrEqual(picker!.getBoundingClientRect().right);
    expect(Math.round(cell.width)).toBe(Math.round(cell.height));
    const { left, right } = picker!.getBoundingClientRect();
    expect([Math.round(left), Math.round(right)]).toEqual([Math.round(list.left), Math.round(list.right)]);
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
  });

  it('picks the generic enemy\'s picture in a row of its own, and takes it away again', async () => {
    document.head.append(style);
    const picture = 'tokens/goblin.webp';
    const { app } = createInMemoryApp({ files: { [picture]: '' } });
    const host = document.body.appendChild(document.createElement('div'));
    host.className = 'atlas-vtt-plugin';
    host.style.width = '480px';
    root = createRoot(host);
    const show = (enemyImagePath: string, onEnemyImageChange: (path: string) => void): void => act(() => root!.render(React.createElement(PartyTab, { app, party: [{ id: 'ara', name: 'Ara' }], onChange: () => undefined, enemyImagePath, onEnemyImageChange })));
    const picked: string[] = [];
    show('', (path) => picked.push(path));
    const enemyButton = (): HTMLButtonElement => [...host.querySelectorAll<HTMLButtonElement>('.atlas-csm-party-picture')].at(-1)!;
    expect(host.querySelector('.atlas-csm-party-enemy-name ~ * .atlas-csm-condition-delete, .atlas-csm-party-enemy-name ~ .atlas-csm-condition-delete')).toBeNull();

    act(() => enemyButton().click());
    // Below the enemy's row, not a player's
    const pickerEl = host.querySelector('.atlas-csm-party-picker')!;
    expect(pickerEl.previousElementSibling?.querySelector('.atlas-csm-party-enemy-name')).not.toBeNull();
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="goblin"]')!.click());
    expect(picked).toEqual([picture]);
    expect(host.querySelector('.atlas-csm-party-picker')).toBeNull();

    show(picture, (path) => picked.push(path));
    expect(enemyButton().querySelector('.atlas-token-portrait')).not.toBeNull();
    const row = enemyButton().closest('.atlas-csm-party-member')!;
    act(() => row.querySelector<HTMLButtonElement>('.atlas-csm-condition-delete')!.click());
    expect(picked).toEqual([picture, '']);
    expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
  });

  it('keeps a thumbnail\'s loading placeholder inside its cell', () => {
    document.head.append(style);
    const { app } = createInMemoryApp({ files: { 'portraits/ara.webp': '' } });
    const host = document.body.appendChild(document.createElement('div'));
    host.className = 'atlas-vtt-plugin';
    host.style.width = '480px';
    root = createRoot(host);
    act(() => root!.render(React.createElement(PartyTab, { app, party: [{ id: 'ara', name: 'Ara' }], onChange: () => undefined, enemyImagePath: '', onEnemyImageChange: () => undefined })));
    act(() => host.querySelector<HTMLButtonElement>('.atlas-csm-party-picture')!.click());

    // A placeholder that breathes over the dialog or the window instead of its cell flashes all of it
    const placeholder = host.querySelector('[aria-label="ara"] .atlas-image-placeholder')!.getBoundingClientRect();
    const cell = host.querySelector('[aria-label="ara"]')!.getBoundingClientRect();
    expect(placeholder.width).toBeGreaterThan(0);
    expect(placeholder.left).toBeGreaterThanOrEqual(cell.left);
    expect(placeholder.top).toBeGreaterThanOrEqual(cell.top);
    expect(placeholder.right).toBeLessThanOrEqual(cell.right);
    expect(placeholder.bottom).toBeLessThanOrEqual(cell.bottom);
  });

  it('shows a picture as a thumbnail made in the image workers', async () => {
    document.head.append(style);
    // The vault mock holds text, so the picture is an SVG; it takes the same way to a thumbnail
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c33"/></svg>';
    const { app } = createInMemoryApp({ files: { 'portraits/ara.svg': svg } });
    const host = document.body.appendChild(document.createElement('div'));
    host.className = 'atlas-vtt-plugin';
    host.style.width = '480px';
    root = createRoot(host);
    act(() => root!.render(React.createElement(PartyTab, { app, party: [{ id: 'ara', name: 'Ara' }], onChange: () => undefined, enemyImagePath: '', onEnemyImageChange: () => undefined })));
    act(() => host.querySelector<HTMLButtonElement>('.atlas-csm-party-picture')!.click());

    await expect.poll(() => host.querySelector<HTMLImageElement>('[aria-label="ara"] img')?.src ?? '', { timeout: 20_000 }).toMatch(/^blob:/);
    const image = host.querySelector<HTMLImageElement>('[aria-label="ara"] img')!;
    await image.decode();
    // A small copy, not the picture itself
    expect(image.naturalWidth).toBeLessThanOrEqual(128);
  });
});
