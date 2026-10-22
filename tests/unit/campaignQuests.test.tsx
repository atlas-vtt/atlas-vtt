// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import type { Campaign } from '../../src/app/campaigns/campaignTypes';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { questVault, type QuestVault } from '../mocks/questVault';

import { CampaignQuests } from '../../src/app/react/components/dashboard/quests/CampaignQuests';

const WORLD_MAP = 'atlas-vtt/assets/world.webp';
const note = (properties: string, body = ''): string => `---\natlas-type: quest\ncampaign: Blood Olms\n${properties}\n---\n${body}\n`;
const CAMPAIGN: Campaign = { id: 'c-1', name: 'Blood Olms', createdAt: 1, worldMap: 'map-1' };

interface Rendered {
  vault: QuestVault;
  opened: string[];
}

function renderQuests(files: Record<string, string>, { disabled = false }: { disabled?: boolean } = {}): Rendered {
  const vault = questVault({ [WORLD_MAP]: 'WEBP', ...files });
  QuestIndex.open(vault.app);
  const opened: string[] = [];
  vault.app.workspace.getLeaf = vi.fn(() => ({ openFile: vi.fn(async (file: { path: string }) => { opened.push(file.path); }) }));
  const service = new CampaignService(memoryCampaigns([{ id: CAMPAIGN.id, name: CAMPAIGN.name, createdAt: 1, worldMap: 'map-1' }]));
  render(<CampaignQuests app={vault.app as App} campaign={CAMPAIGN} campaigns={[CAMPAIGN]} service={service} disabled={disabled} />);
  apps.push(vault.app);
  return { vault, opened };
}

const apps: App[] = [];
const rowOf = (title: string): HTMLElement => screen.getByText(title).closest('li')!;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) QuestIndex.release(app);
  vi.restoreAllMocks();
});

describe('the quests of a campaign\'s page', () => {
  it('lists main quests, then side quests, with those done or failed folded away', () => {
    renderQuests({
      'Q/Crown.md': note('kind: main\nstatus: active\nexperience: 1200\nrewards: [Favour of the King]'),
      'Q/Eggs.md': note('kind: side'),
      'Q/Ledger.md': note('status: open'),
      'Q/Old.md': note('kind: main\nstatus: done'),
      'Q/Lost.md': note('kind: side\nstatus: failed'),
      'Q/Elsewhere.md': '---\natlas-type: quest\ncampaign: Witherwild\n---\n',
    });
    const groups = [...document.querySelectorAll('.campaign-quests__group')];
    expect(groups.map((group) => [...group.querySelectorAll('.campaign-quest__title')].map((title) => title.textContent))).toEqual([['Crown'], ['Eggs', 'Ledger'], []]);
    expect(within(rowOf('Crown')).getByText('1,200 XP · Favour of the King')).toBeTruthy();
    const fold = screen.getByRole('button', { name: /Done and failed/ });
    expect(fold.textContent).toContain('2');
    fireEvent.click(fold);
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect([...groups[2]!.querySelectorAll('.campaign-quest__title')].map((title) => title.textContent)).toEqual(['Old', 'Lost']);
    expect(screen.queryByText('Elsewhere')).toBeNull();
  });

  it('says so when the campaign has no quests', () => {
    renderQuests({});
    expect(screen.getByText('No quests yet.')).toBeTruthy();
  });

  it('opens a quest\'s note from its name, and sets its status in the note', async () => {
    const { vault, opened } = renderQuests({ 'Q/Crown.md': note('kind: main', 'Find the crown.') });
    fireEvent.click(screen.getByText('Crown'));
    await waitFor(() => expect(opened).toEqual(['Q/Crown.md']));

    fireEvent.click(screen.getByRole('combobox', { name: 'Status of Crown' }));
    fireEvent.click(screen.getByRole('option', { name: 'Done' }));
    await waitFor(() => expect(vault.files.get('Q/Crown.md')).toContain('status: done'));
    expect(vault.files.get('Q/Crown.md')).toContain('Find the crown.');
    // Done, it goes into the fold.
    await waitFor(() => expect(screen.queryByText('Crown')).toBeNull());
  });

  it('creates a new quest note in the campaign\'s folder with its kind, and opens it', async () => {
    const { vault, opened } = renderQuests({});
    fireEvent.click(screen.getByRole('button', { name: 'New quest' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Side' }));
    const field = screen.getByRole('textbox', { name: 'Quest title' });
    fireEvent.change(field, { target: { value: 'Olm eggs' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    const path = 'atlas-vtt/campaigns/Blood Olms/quests/Olm eggs.md';
    await waitFor(() => expect(opened).toEqual([path]));
    expect(vault.files.get(path)).toMatch(/atlas-type: quest\ncampaign: c-1\nkind: side\nstatus: open\natlas-id: [0-9a-f]{24}\n/);
    await screen.findByText('Olm eggs');
  });

  it('cancels a new quest with Escape, or when the field is left empty', () => {
    renderQuests({});
    fireEvent.click(screen.getByRole('button', { name: 'New quest' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Quest title' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Quest title' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New quest' }));
    fireEvent.blur(screen.getByRole('textbox', { name: 'Quest title' }), { relatedTarget: document.body });
    expect(screen.queryByRole('textbox', { name: 'Quest title' })).toBeNull();
  });

  it('places no quest on the world map itself: a pin on the world map scene does', async () => {
    renderQuests({ 'Q/Crown.md': note('kind: main\nplace: { x: 0.25, y: 0.5 }') });
    expect(within(rowOf('Crown')).getAllByRole('button').map((button) => button.textContent)).toEqual(['Crown']);
    await act(async () => {});
  });

  it('offers no edits for a campaign a newer Atlas wrote', async () => {
    renderQuests({ 'Q/Crown.md': note('kind: main') }, { disabled: true });
    expect((screen.getByRole('button', { name: 'New quest' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Status of Crown' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {});
  });
});
