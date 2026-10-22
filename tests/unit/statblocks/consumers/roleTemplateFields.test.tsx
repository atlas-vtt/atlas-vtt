// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IndexedCreature } from '../../../../src/app/creatures/CreatureIndex';
import { suggestedFilterFields } from '../../../../src/app/creatures/templateFilterFields';
import { CreatureFiltersTab } from '../../../../src/app/react/components/collection-settings/CreatureFiltersTab';
import { ResourcesTab } from '../../../../src/app/react/components/collection-settings/ResourcesTab';
import { roleTemplatesOf, useRoleTemplates } from '../../../../src/app/react/components/collection-settings/useRoleTemplates';
import { HP_RESOURCE } from '../../../../src/app/resources/resourceDefinitions';
import { resourceFieldSuggestions, templateResourceFields } from '../../../../src/app/resources/resourceFieldSuggestions';
import type { CreatureFilterDefinition } from '../../../../src/app/types/creatureFilterTypes';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { CAIRN_CREATURE } from '../../../../src/app/statblocks/presets/cairn';
import { DRAW_STEEL_MONSTER } from '../../../../src/app/statblocks/presets/drawSteel';
import { GENERIC_CREATURE } from '../../../../src/app/statblocks/presets/generic';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';

afterEach(cleanup);

const CAIRN = CAIRN_CREATURE.template;
const DRAW_STEEL = DRAW_STEEL_MONSTER.template;
const creature = (fields: Record<string, unknown>): IndexedCreature => ({ path: String(fields.name), templateId: null, meanings: {}, lookName: null, fields });

describe('the Resources tab\'s field chips', () => {
  it('offers a template\'s hit points first, then its numbers and each slot of its scores by name', () => {
    expect(templateResourceFields([CAIRN])).toEqual([
      { path: 'hp', label: 'HP' },
      { path: 'armor', label: 'Armor' },
      { path: 'stats.0', label: 'STR' },
      { path: 'stats.1', label: 'DEX' },
      { path: 'stats.2', label: 'WIL' },
    ]);
  });

  it('offers each path once, and the statblocks\' further fields after the templates\'', () => {
    const offered = resourceFieldSuggestions([DRAW_STEEL, CAIRN], [{ stamina: 30, hp: 4, ammo: '3/6' }]);
    expect(offered.slice(0, 2)).toEqual([{ path: 'stamina', label: 'Stamina' }, { path: 'hp', label: 'HP' }]);
    expect(offered.filter(({ path }) => path === 'hp')).toHaveLength(1);
    expect(offered.at(-1)).toEqual({ path: 'ammo' });
  });

  it('shows a chip with the template\'s name and the path it stores, found by either', () => {
    function Editor(): React.JSX.Element {
      const [resources, setResources] = useState([{ ...HP_RESOURCE }]);
      return <ResourcesTab resources={resources} fieldSuggestions={resourceFieldSuggestions([CAIRN], [])} onChange={setResources} />;
    }
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'HP: bar below the token' }));
    const chips = within(screen.getByRole('group', { name: 'Fields in this collection\'s statblocks' })).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toContain('STRstats.0');
    fireEvent.change(screen.getByRole('textbox', { name: 'Statblock field' }), { target: { value: 'wil' } });
    expect(within(screen.getByRole('group', { name: 'Fields in this collection\'s statblocks' })).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['WILstats.2']);
  });
});

describe('the Creature Filters tab\'s suggestions', () => {
  it('suggests a template\'s ratings, numbers, choices and lists first, by its names', () => {
    const fields = suggestedFilterFields([DRAW_STEEL], [creature({ name: 'Guard', level: 3, role: 'Brute', ev: 12, villainy: 'High' })]);
    expect(fields.slice(0, 4).map(({ field, label, kind }) => [field, label, kind])).toEqual([
      ['level', 'Level', 'range'],
      ['organization', 'Organization', 'options'],
      ['role', 'Role', 'options'],
      ['keywords', 'Keywords', 'options'],
    ]);
    expect(fields.find((field) => field.field === 'organization')?.samples).toEqual(['Minion', 'Horde', 'Platoon']);
    expect(fields.find((field) => field.field === 'role')).toMatchObject({ count: 1, samples: ['Brute'] });
    expect(fields.find((field) => field.field === 'size')).toMatchObject({ label: 'Size', kind: 'options' });
    expect(fields.find((field) => field.field === 'villainy')).toMatchObject({ kind: 'options', samples: ['High'] });
    expect(fields.find((field) => field.field === 'ev')?.label).toBeUndefined();
  });

  it('lists the template\'s fields as filters of their own, each switched off by itself, also before any statblock is linked', () => {
    let hidden: string[] = [];
    function Harness(): React.JSX.Element {
      const [off, setOff] = useState<string[]>([]);
      hidden = off;
      return <CreatureFiltersTab hidden={off} onHiddenChange={setOff} custom={[]} onCustomChange={() => undefined} creatures={[]} pending={false} templates={[GENERIC_CREATURE.template]} />;
    }
    render(<Harness />);
    const list = screen.getByRole('list', { name: 'From the statblock templates' });
    expect(within(list).getAllByRole('listitem').map((item) => item.querySelector('code')?.textContent)).toEqual(['size', 'ac', 'hp']);
    // Filters by themselves, so they are no suggestions any more.
    expect(screen.queryByRole('list', { name: 'Statblock fields' })).toBeNull();
    fireEvent.click(within(list).getByRole('checkbox', { name: 'Filter by hit points' }));
    expect(hidden).toEqual(['hp']);
  });
});

describe('the templates of a collection\'s roles', () => {
  it('takes each template once, in role order, and leaves out what is missing', () => {
    const roles = [
      { id: 'monster', name: 'Monster', templateId: 'builtin:cairn-creature' },
      { id: 'boss', name: 'Boss', templateId: 'builtin:cairn-creature' },
      { id: 'gone', name: 'Gone', templateId: 'gone-abc123' },
    ];
    expect(roleTemplatesOf(roles, (id) => (id === 'builtin:cairn-creature' ? CAIRN : null))).toEqual([CAIRN]);
  });

  it('reads built-ins without loading the library, and follows the library for a vault template', async () => {
    const { app, files } = createInMemoryApp({ files: {} });
    const builtIns = renderHook(() => useRoleTemplates(app, [{ id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' }], true));
    expect(builtIns.result.current.map((template) => template.id)).toEqual(['builtin:generic-npc']);
    expect(app.workspace.onLayoutReady).not.toHaveBeenCalled();

    files.set(MARSH_PATH, marshText());
    const vault = renderHook(() => useRoleTemplates(app, [{ id: 'monster', name: 'Monster', templateId: MARSH_ID }], true));
    await waitFor(() => expect(vault.result.current.map((template) => template.id)).toEqual([MARSH_ID]));
    TemplateLibrary.release(app);
  });

  it('reads nothing while the tabs that offer fields are closed', () => {
    const { app } = createInMemoryApp({ files: {} });
    const { result } = renderHook(() => useRoleTemplates(app, [{ id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' }], false));
    expect(result.current).toEqual([]);
  });
});
