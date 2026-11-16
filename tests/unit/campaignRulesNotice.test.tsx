// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { rulesOfPreset } from '../../src/app/gameSystems/systemRules';
import { CampaignRulesDialog } from '../../src/app/react/components/dashboard/CampaignRulesDialog';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import { memoryPresets } from '../mocks/memoryPresets';
import { DND5E, playedCampaignWorld, releasePlayedCampaignWorlds, type PlayedCampaignWorld } from '../mocks/playedCampaignWorld';

const presetService = new SystemPresetService(memoryPresets());
vi.mock('../../src/app/react/hooks/useSystemPresets', () => ({
  useSystemPresets: () => ({ service: presetService, presets: presetService.list() }),
}));

const NOTICE = 'Maps play by these rules only while this campaign\'s online table is open.';

function openRules(world: PlayedCampaignWorld): void {
  const service = new CampaignService(world.campaigns);
  const app: App = world.app;
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <CampaignRulesDialog app={app} campaign={service.get('saga')!} service={service} onClose={() => {}} />
    </AtlasUIContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  releasePlayedCampaignWorlds();
  vi.restoreAllMocks();
});

describe('a campaign\'s game system', () => {
  it('says on its rules tabs when maps play by it, while the campaign is not played', () => {
    const world = playedCampaignWorld({ ...rulesOfPreset(DND5E), systemPresetId: DND5E.id });
    openRules(world);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resources' }));
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it('says nothing while the campaign is played, and says it again once play stops', () => {
    const world = playedCampaignWorld({ ...rulesOfPreset(DND5E), systemPresetId: DND5E.id });
    world.play.play('saga');
    openRules(world);
    expect(screen.queryByText(NOTICE)).toBeNull();
    act(() => world.play.stop());
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it('says nothing for a campaign without a game system: every map plays by its collection\'s rules', () => {
    const world = playedCampaignWorld({ ...rulesOfPreset(DND5E), systemPresetId: DND5E.id });
    world.campaigns.update('saga', ({ system: _system, ...rest }) => rest);
    openRules(world);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
