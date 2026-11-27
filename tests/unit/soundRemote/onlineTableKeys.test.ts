// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { remoteTableOf } from '@/app/plugin/soundRemoteTable';
import { PlayerWindowService } from '@/app/services/PlayerWindowService';
import type { HoveredElement } from '@/app/soundRemote/hoveredElement';
import { remotePlayer, runTableCommand } from '@/app/soundRemote/remoteTable';
import { tableControlsStore } from '@/app/stores/tableControlsStore';

vi.mock('@/app/ui/notice', () => ({ showNotice: vi.fn() }));

const app = { workspace: { getActiveViewOfType: () => null, getLeavesOfType: () => [] } } as unknown as App;
const table = remoteTableOf(app, { element: () => null } as unknown as HoveredElement);

beforeEach(() => tableControlsStore.setState({ curtain: false, paused: false, online: true }));

describe('Stream Deck keys at an online table without a player window', () => {
  it('lower the curtain and pause online players, and the state lights the keys', () => {
    expect(PlayerWindowService.getInstance()?.isWindowOpen() ?? false).toBe(false);
    expect(runTableCommand(table, { type: 'curtain' })).toBeNull();
    expect(runTableCommand(table, { type: 'freeze' })).toBeNull();
    expect(tableControlsStore.getState()).toMatchObject({ curtain: true, paused: true });
    expect(remotePlayer(table)).toMatchObject({ open: false, hidden: true, frozen: true });
    expect(runTableCommand(table, { type: 'curtain' })).toBeNull();
    expect(runTableCommand(table, { type: 'freeze' })).toBeNull();
    expect(tableControlsStore.getState()).toMatchObject({ curtain: false, paused: false });
    expect(remotePlayer(table)).toMatchObject({ hidden: false, frozen: false });
  });

  it('are refused once the table has ended', () => {
    tableControlsStore.setState({ online: false });
    expect(runTableCommand(table, { type: 'curtain' })).toBe('no-player-window');
    expect(runTableCommand(table, { type: 'freeze' })).toBe('no-player-window');
    expect(tableControlsStore.getState()).toMatchObject({ curtain: false, paused: false });
  });
});
