// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTemplate, TemplateLookup } from '../../../../src/app/statblocks/model/resolvedTypes';
import { NewStatblockButton, createStatblockMenuEntry } from '../../../../src/app/statblocks/editor/create/RoleMenu';
import { roleChoicesOf, type RoleChoice } from '../../../../src/app/statblocks/editor/create/roleChoices';

afterEach(cleanup);

const named = (name: string): LibraryTemplate => ({ name } as LibraryTemplate);
const LOOKUP: TemplateLookup = {
  get: (id) => ({ 'builtin:generic-creature': named('Creature'), 'marsh-k7m2qa': named('Marsh creature') } as Record<string, LibraryTemplate>)[id] ?? null,
};
const MONSTER: RoleChoice = { roleId: 'monster', name: 'Monster', templateName: 'Marsh creature' };
const NPC: RoleChoice = { roleId: 'npc', name: 'NPC', templateName: 'NPC' };

describe('role choices', () => {
  it('names each role\'s template, the generic one where the library lacks it, none while the library loads', () => {
    const roles = [
      { id: 'monster', name: 'Monster', templateId: 'marsh-k7m2qa' },
      { id: 'beast', name: 'Beast', templateId: 'gone-aaaaaa' },
    ];
    expect(roleChoicesOf(roles, LOOKUP, false)).toEqual([
      { roleId: 'monster', name: 'Monster', templateName: 'Marsh creature' },
      { roleId: 'beast', name: 'Beast', templateName: 'Creature' },
    ]);
    expect(roleChoicesOf(roles, LOOKUP, true)[1]?.templateName).toBe('');
  });
});

describe('Create statblock in a context menu', () => {
  it('creates at once with one role', () => {
    const onChoose = vi.fn();
    const entry = createStatblockMenuEntry([MONSTER], onChoose);
    expect(entry).toMatchObject({ type: 'item', label: 'Create statblock' });
    if (entry.type === 'item') void entry.onClick();
    expect(onChoose).toHaveBeenCalledWith('monster');
  });

  it('opens the role menu with several: each role with its template muted, never repeating the name', () => {
    const entry = createStatblockMenuEntry([MONSTER, NPC], vi.fn());
    if (entry.type !== 'submenu' || typeof entry.children === 'function') throw new Error('expected a submenu');
    expect(entry.children).toEqual([
      expect.objectContaining({ type: 'item', label: 'Monster', detail: 'Marsh creature' }),
      expect.objectContaining({ type: 'item', label: 'NPC' }),
    ]);
    expect(entry.children[1]).not.toHaveProperty('detail');
  });
});

describe('New statblock… in a dialog', () => {
  it('creates at once with one role', () => {
    const onChoose = vi.fn();
    render(<NewStatblockButton choices={[MONSTER]} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'New statblock' }));
    expect(onChoose).toHaveBeenCalledWith('monster');
  });

  it('opens the role menu with several and says when it is open', async () => {
    const onChoose = vi.fn();
    const onMenuOpenChange = vi.fn();
    render(<NewStatblockButton choices={[MONSTER, NPC]} onChoose={onChoose} onMenuOpenChange={onMenuOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'New statblock…' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole('menuitem', { name: /Monster/ }));
    expect(onChoose).toHaveBeenCalledWith('monster');
    await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));
  });
});
