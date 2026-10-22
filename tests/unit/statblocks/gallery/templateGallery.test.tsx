// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateGallery } from '../../../../src/app/statblocks/editor/gallery/TemplateGallery';
import { createFromPick, type CreatedTemplate, type GalleryPick } from '../../../../src/app/statblocks/editor/gallery/galleryActions';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { GENERIC_CREATURE } from '../../../../src/app/statblocks/presets/generic';
import type { StatblockRole } from '../../../../src/app/statblocks/model/roleTypes';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { TEMPLATE_FOLDER } from '../library/templateTexts';

const FIVE_E = 'builtin:5e-2024-monster';
const WARDEN = 'Bestiary/Marsh Warden.md';
const MONSTER: StatblockRole = { id: 'monster', name: 'Monster', templateId: FIVE_E };

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

let vault: SessionVault;
let onCreated: ReturnType<typeof vi.fn<(created: CreatedTemplate, roleId: string | null) => void>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vault = sessionVault();
  vault.files.set(WARDEN, '---\nstatblock: true\nname: Marsh Warden\n---\n');
  vault.frontmatter[WARDEN] = { statblock: true, name: 'Marsh Warden', hp: 52, actions: [{ name: 'Lash', desc: 'It lashes.' }] };
  vault.files.set('Notes/Plain.md', 'Just a note.\n');
  await vault.settled();
  onCreated = vi.fn();
  onClose = vi.fn();
});

afterEach(async () => {
  cleanup();
  await closeSessionVault(vault);
  vi.restoreAllMocks();
});

/** Use template as a collection's settings take it: the pick is written to the library at once. */
async function onUse(pick: GalleryPick, roleId: string | null): Promise<CreatedTemplate> {
  const created = await createFromPick(vault.app, pick);
  onCreated(created, roleId);
  return created;
}

function open(roles: readonly StatblockRole[] = [MONSTER], system: string[] = [FIVE_E]): void {
  render(
    <TooltipProvider>
      <TemplateGallery app={vault.app} doc={document} roles={roles} systemTemplateIds={system} onUse={onUse} onClose={onClose} />
    </TooltipProvider>,
  );
}

const cards = (): HTMLElement[] => screen.getAllByRole('radio');
const card = (name: string): HTMLElement => screen.getByRole('radio', { name });
const source = (label: string): void => { fireEvent.click(screen.getByRole('tab', { name: label })); };
const read = (path: string): StatblockTemplate => JSON.parse(vault.files.get(path)!) as StatblockTemplate;
const useTemplate = async (): Promise<void> => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use template' })); });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
};

describe('the template gallery', () => {
  it('opens on the system\'s templates, then lists every built-in and the generic tier', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'New template' })).toBeTruthy();
    expect(cards().map((radio) => radio.textContent)).toEqual(['5E (2024 rules)']);
    source('All built-ins');
    expect(cards()).toHaveLength(12);
    source('Simple');
    expect(cards().map((radio) => radio.textContent)).toEqual(['Creature', 'NPC', 'Hazard']);
  });

  it('leaves This system out where the collection\'s system names no template', () => {
    open([], []);
    expect(screen.queryByRole('tab', { name: 'This system' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'All built-ins' }).getAttribute('aria-selected')).toBe('true');
  });

  it('draws each card with the real renderer and gives a source line to licensed built-ins only', () => {
    open([], []);
    const grid = screen.getByRole('radiogroup', { name: 'All built-ins' });
    expect(grid.querySelectorAll('.atlas-te-gallery-card__frame .atlas-sb-sheet')).toHaveLength(12);
    const lines = [...grid.querySelectorAll('.atlas-te-gallery-card__source-text')].map((line) => line.textContent);
    expect(lines).toHaveLength(5);
    expect(lines).toContain('SRD 5.2.1 · CC BY 4.0');
    const generic = card('Creature').closest('li')!;
    expect(generic.querySelector('.atlas-te-gallery-card__source')).toBeNull();
    expect(within(generic).queryByRole('button', { name: /Where/ })).toBeNull();
  });

  it('opens the full attribution from a card\'s info button, and Escape closes it before the gallery', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Where 5E (2024 rules) comes from' }));
    const popover = await screen.findByRole('dialog', { name: '5E (2024 rules)' });
    expect(popover.textContent).toContain('System Reference Document 5.2.1');
    expect(popover.textContent).toContain('Atlas VTT arranged the stat block structure as an editable template.');
    expect(within(popover).getByRole('link', { name: 'Read the licence' }).getAttribute('href')).toBe('https://creativecommons.org/licenses/by/4.0/legalcode');
    fireEvent.keyDown(popover, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '5E (2024 rules)' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('makes an editable copy with Use template, recording the built-in it came from in the copy', async () => {
    open([], []);
    fireEvent.click(card('Creature'));
    await useTemplate();
    const [created, roleId] = onCreated.mock.calls[0]!;
    expect(roleId).toBeNull();
    expect(created.path).toBe(`${TEMPLATE_FOLDER}/Creature.atlastemplate`);
    const copy = read(created.path);
    expect(copy.id).toBe(created.id);
    expect(copy.derivedFrom).toEqual({ templateId: 'builtin:generic-creature', revision: GENERIC_CREATURE.revision });
    expect(TemplateLibrary.forApp(vault.app).get(created.id)?.builtIn).toBe(false);
  });

  it('uses a card on a double click, and chooses with the arrows', async () => {
    open([], []);
    fireEvent.keyDown(card('Creature'), { key: 'ArrowRight' });
    expect(card('NPC').getAttribute('aria-checked')).toBe('true');
    await act(async () => { fireEvent.doubleClick(card('NPC').closest('li')!); });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(read(onCreated.mock.calls[0]![0].path).derivedFrom?.templateId).toBe('builtin:generic-npc');
  });

  it('offers a role without a template of its own, starting on the one that uses the chosen card', async () => {
    const hag: StatblockRole = { id: 'hag', name: 'Hag', templateId: 'marsh-creature-k7m2qa' };
    open([MONSTER, hag]);
    const useFor = screen.getByRole('combobox', { name: 'Starts new statblocks for' });
    expect(useFor.textContent).toBe('Monster');
    fireEvent.click(useFor);
    expect(within(screen.getByRole('listbox', { name: 'Starts new statblocks for' })).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Nothing yet', 'Monster']);
    fireEvent.click(screen.getByRole('option', { name: 'Monster' }));
    await useTemplate();
    expect(onCreated.mock.calls[0]![1]).toBe('monster');
  });

  it('gives the template to no role once "Nothing yet" is chosen', async () => {
    open();
    fireEvent.click(screen.getByRole('combobox', { name: 'Starts new statblocks for' }));
    fireEvent.click(screen.getByRole('option', { name: 'Nothing yet' }));
    await useTemplate();
    expect(onCreated.mock.calls[0]![1]).toBeNull();
  });

  it('builds a template from a statblock\'s values, named after it', async () => {
    open();
    source('From a statblock');
    const list = screen.getByRole('listbox', { name: 'Statblocks' });
    expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['Marsh Warden']);
    fireEvent.click(within(list).getByRole('option', { name: 'Marsh Warden' }));
    expect(card('Marsh Warden').closest('li')!.querySelector('.atlas-sb-sheet')?.textContent).toContain('Lash');
    await useTemplate();
    const [created] = onCreated.mock.calls[0]!;
    expect(created.path).toBe(`${TEMPLATE_FOLDER}/Marsh Warden.atlastemplate`);
    expect(read(created.path).fields.map((field) => field.key)).toEqual(['name', 'hp', 'actions']);
    expect(read(created.path).derivedFrom).toBeUndefined();
  });

  it('starts a blank template with no blocks', async () => {
    open();
    source('Blank');
    expect(card('Blank').closest('li')!.textContent).toContain('Actions');
    await useTemplate();
    const [created] = onCreated.mock.calls[0]!;
    expect(read(created.path).layout.blocks).toEqual([]);
    await vault.settled();
    expect(TemplateLibrary.forApp(vault.app).get(created.id)?.status).toBe('ok');
  });

  it('closes on Escape and marks the key as used, so a dialog it opened over stays open', () => {
    open();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { card('5E (2024 rules)').dispatchEvent(event); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
