// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { headerParts, setHeaderPartHidden } from '../../../../src/app/statblocks/model/templateHeader';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockText, renderSheet, templateOf, valueOf } from './sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'cr', label: 'Challenge', type: 'rating', meaning: 'rating' },
  { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
  { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
  { key: 'description', label: 'Description', type: 'markdown' },
  { key: 'ac', label: 'Armor Class', type: 'number' },
];
const TEMPLATE = templateOf(FIELDS, [{ id: 'statac01', type: 'stat', field: 'ac', look: 'run-in' }]);
const VALUES = {
  name: 'Bog Hag', image: 'https://example.com/hag.png', cr: '3', type: 'Fey', hp: 45, description: 'She trades in names.', ac: 15,
};

/** The header's drawn parts in document order. */
function drawnParts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.atlas-sb-header [data-block-id]')].map((frame) => frame.getAttribute('data-block-id') ?? '');
}

function labelOf(container: HTMLElement, id: string): string {
  return container.querySelector(`[data-block-id="${id}"] .atlas-sb-label`)?.textContent ?? '';
}

function hiding(...parts: Array<'level' | 'type' | 'hp' | 'description'>): StatblockTemplate {
  return parts.reduce((template, part) => setHeaderPartHidden(template, part, true), TEMPLATE);
}

describe('the statblock header', () => {
  it('draws the name over the level and type, then the hit points and the description, the token art at the right, above the layout', () => {
    const { container } = renderSheet(TEMPLATE, VALUES);
    const header = container.querySelector('.atlas-sb-header')!;
    expect(header.nextElementSibling?.classList.contains('atlas-sb-columns')).toBe(true);
    expect(drawnParts(container)).toEqual(['header-name', 'header-level', 'header-type', 'header-hp', 'header-description', 'header-token']);
    expect(header.lastElementChild?.getAttribute('data-block-id')).toBe('header-token');
    expect(labelOf(container, 'header-level')).toBe('Challenge');
    expect(valueOf(container, 'header-level')).toBe('3');
    expect(blockText(container, 'header-type')).toBe('Fey');
    expect(header.querySelector('.atlas-sb-header__dot')?.previousElementSibling?.getAttribute('data-block-id')).toBe('header-level');
    expect(blockText(container, 'header-name')).toBe('Bog Hag');
    expect(labelOf(container, 'header-hp')).toBe('Hit Points');
    expect(valueOf(container, 'header-hp')).toBe('45');
    expect(container.querySelector('[data-block-id="header-hp"] [data-hit-points]')).not.toBeNull();
    expect(blockText(container, 'header-description')).toBe('She trades in names.');
  });

  it('leaves no room for the parts a template hides, nor a separator for a type shown alone', () => {
    const { container } = renderSheet(hiding('level', 'description'), VALUES);
    expect(drawnParts(container)).toEqual(['header-name', 'header-type', 'header-hp', 'header-token']);
    expect(container.querySelector('.atlas-sb-header__dot')).toBeNull();
    const { container: bare } = renderSheet(hiding('level', 'type'), VALUES);
    expect(bare.querySelector('.atlas-sb-header__subtitle')).toBeNull();
  });

  it('draws nothing for empty parts on a card that is read, and their prompts where it is edited', () => {
    const { container } = renderSheet(TEMPLATE, { name: 'Bog Hag' });
    expect(drawnParts(container)).toEqual(['header-name']);
    const { container: editing } = renderSheet(TEMPLATE, {}, { mode: 'editing' });
    expect(drawnParts(editing)).toEqual(['header-name', 'header-level', 'header-type', 'header-hp', 'header-description', 'header-token']);
    expect(blockText(editing, 'header-name')).toBe('Add name');
    expect(blockText(editing, 'header-type')).toBe('Add type');
    expect(blockText(editing, 'header-description')).toBe('Add description');
    const { container: empty } = renderSheet(TEMPLATE, {});
    expect(empty.querySelector('.atlas-sb-header')).toBeNull();
  });

  it('names each part by its field\'s label, and shows the hit dice beside the hit points', () => {
    const renamed = templateOf([...FIELDS.map((field) => (field.key === 'cr' ? { ...field, label: 'Tier' } : field)), { key: 'hit_dice', label: 'Hit Dice', type: 'dice' }], []);
    const { container } = renderSheet(renamed, { ...VALUES, hit_dice: '6d8 + 18' });
    expect(labelOf(container, 'header-level')).toBe('Tier');
    expect(valueOf(container, 'header-hp')).toBe('45 (6d8 + 18)');
  });

  it('shows the display name where the statblock has one, else the name, and edits the display name', () => {
    const titled = templateOf([...FIELDS, { key: 'title', label: 'Title', type: 'text', meaning: 'display-name' }], []);
    const { container } = renderSheet(titled, { ...VALUES, name: 'Aranea (Cairn)', title: 'Aranea' });
    expect(blockText(container, 'header-name')).toBe('Aranea');
    const { container: untitled } = renderSheet(titled, { ...VALUES, name: 'Aranea (Cairn)' });
    expect(blockText(untitled, 'header-name')).toBe('Aranea (Cairn)');
    expect(headerParts(titled).find((part) => part.id === 'name')).toMatchObject({ key: 'name', label: 'Name', block: { field: 'title' } });
    const { container: plain } = renderSheet(templateOf([...FIELDS, { key: 'title', label: 'Title', type: 'text' }], []), { ...VALUES, title: 'Aranea' });
    expect(blockText(plain, 'header-name')).toBe('Bog Hag');
  });
});

