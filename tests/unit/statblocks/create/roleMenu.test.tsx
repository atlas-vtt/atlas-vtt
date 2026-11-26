// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTemplate, TemplateLookup } from '../../../../src/app/statblocks/model/resolvedTypes';
import { NewStatblockButton, createStatblockMenuEntry } from '../../../../src/app/statblocks/editor/create/RoleMenu';
import { roleChoicesOf } from '../../../../src/app/statblocks/editor/create/roleChoices';
import type { TemplateOffer } from '../../../../src/app/statblocks/editor/create/templateOffers';

afterEach(cleanup);

const named = (name: string): LibraryTemplate => ({ name } as LibraryTemplate);
const LOOKUP: TemplateLookup = {
  get: (id) => ({ 'builtin:generic-creature': named('Creature'), 'marsh-k7m2qa': named('Marsh creature') } as Record<string, LibraryTemplate>)[id] ?? null,
};
const MONSTER: TemplateOffer = { templateId: 'marsh-k7m2qa', roleId: 'monster', label: 'Monster', detail: 'Marsh creature' };
const NPC: TemplateOffer = { templateId: 'builtin:generic-npc', roleId: 'npc', label: 'NPC', detail: 'NPC' };
const FEN: TemplateOffer = { templateId: 'fen-b3x9aa', label: 'Fen creature', detail: 'Your template' };

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
    expect(onChoose).toHaveBeenCalledWith(MONSTER);
  });

  it('lists the templates no role starts from after the roles, under a line (#656)', () => {
    const onChoose = vi.fn();
    const entry = createStatblockMenuEntry([MONSTER, NPC, FEN], onChoose);
    if (entry.type !== 'submenu' || typeof entry.children === 'function') throw new Error('expected a submenu');
    expect(entry.children.map((child) => (child.type === 'item' ? child.label : child.type))).toEqual(['Monster', 'NPC', 'custom', 'Fen creature']);
    expect(entry.children[3]).toMatchObject({ detail: 'Your template' });
    const fen = entry.children[3];
    if (fen?.type === 'item') void fen.onClick();
    expect(onChoose).toHaveBeenCalledWith(FEN);
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
    expect(onChoose).toHaveBeenCalledWith(MONSTER);
  });

  it('opens the role menu with several and says when it is open', async () => {
    const onChoose = vi.fn();
    const onMenuOpenChange = vi.fn();
    render(<NewStatblockButton choices={[MONSTER, NPC]} onChoose={onChoose} onMenuOpenChange={onMenuOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'New statblock…' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole('menuitem', { name: /Monster/ }));
    expect(onChoose).toHaveBeenCalledWith(MONSTER);
    await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));
  });
});
