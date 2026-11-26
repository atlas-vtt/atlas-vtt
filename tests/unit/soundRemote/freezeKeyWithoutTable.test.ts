// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { remoteTableOf } from '@/app/plugin/soundRemoteTable';
import { PlayerWindowService } from '@/app/services/PlayerWindowService';
import type { HoveredElement } from '@/app/soundRemote/hoveredElement';
import { remotePlayer } from '@/app/soundRemote/remoteTable';
import { tableControlsStore } from '@/app/stores/tableControlsStore';

vi.mock('@/app/ui/notice', () => ({ showNotice: vi.fn() }));

const app = { workspace: { getActiveViewOfType: () => null, getLeavesOfType: () => [] } } as unknown as App;

function windowOpen(): void {
  vi.spyOn(PlayerWindowService, 'getInstance').mockReturnValue({
    isWindowOpen: () => true, isFrozen: () => false, isTrueScale: () => false, isCurtained: () => false,
  } as unknown as PlayerWindowService);
}

function frozenKey(): boolean {
  return remotePlayer(remoteTableOf(app, { element: () => null } as unknown as HoveredElement)).frozen;
}

describe('the Freeze key while the table was paused under TrueScale and the window is not frozen', () => {
  it('stays dark without an online table, as the window is not frozen', () => {
    windowOpen();
    tableControlsStore.setState({ curtain: false, paused: true, online: false });
    expect(frozenKey()).toBe(false);
  });

  it('is lit at an online table, whose players are paused', () => {
    windowOpen();
    tableControlsStore.setState({ curtain: false, paused: true, online: true });
    expect(frozenKey()).toBe(true);
  });
});
