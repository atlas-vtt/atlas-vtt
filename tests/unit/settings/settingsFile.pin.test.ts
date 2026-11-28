// @vitest-environment jsdom
/**
 * The settings files as other versions of Atlas left them: `data.json` as 0.21.2 writes it (the
 * defaults and a filled one), as 0.12.0 wrote it, and as a newer Atlas might, with keys and fields
 * this version does not know; and the device's local storage the same way. Each is read, one
 * preference unrelated to the rest is changed, and what is written back is compared with what was read.
 */
import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { memoryPluginData } from '../../mocks/pluginData';
import defaults0212 from '../../fixtures/settings/data-0.21.2-defaults.json';
import filled0212 from '../../fixtures/settings/data-0.21.2-filled.json';
import file0120 from '../../fixtures/settings/data-0.12.0.json';
import newerFile from '../../fixtures/settings/data-newer.json';

const FILES: Record<string, Record<string, unknown>> = {
  'data-0.21.2-defaults.json': defaults0212,
  'data-0.21.2-filled.json': filled0212,
  'data-0.12.0.json': file0120,
  'data-newer.json': newerFile,
};
const fixture = (name: string): Record<string, unknown> => structuredClone(FILES[name]);

/** The file as Obsidian writes it (`saveData`: two-space JSON). */
const text = (data: unknown): string => JSON.stringify(data, null, 2);

/** Paths at which `after` differs from `before`, a record's fields one by one. */
function changedPaths(before: unknown, after: unknown, at = ''): string[] {
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((key) => changedPaths(before[key], after[key], at ? `${at}.${key}` : key));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [at];
}

/** Reads `file`, changes the dice volume to a quarter and saves: what lands in `data.json`. */
async function savedAfterOneChange(file: Record<string, unknown>): Promise<Record<string, unknown>> {
  const data = memoryPluginData(structuredClone(file));
  const settings = new SettingsService(new App(), undefined, data);
  await settings.initialize();
  settings.setDiceVolume(0.25);
  await settings.saveSettingsNow();
  return data.stored() as Record<string, unknown>;
}

describe("data.json from other versions, read and written back with one preference changed", () => {
  it.each(['data-0.21.2-defaults.json', 'data-0.21.2-filled.json'])('%s comes back byte for byte but for that preference', async (name) => {
    const file = fixture(name);
    expect(text(await savedAfterOneChange(file))).toBe(text({ ...file, diceVolume: 0.25 }));
  });

  it("0.12.0's file gains the defaults of every key it lacks, and keeps its own", async () => {
    const file = fixture('data-0.12.0.json');
    const saved = await savedAfterOneChange(file);
    expect(changedPaths(file, saved)).toEqual([
      'diceVolume',
      'dungeonGenerator.theme', 'dungeonGenerator.floors',
      'localPlayerView.initiativeScale', 'localPlayerView.initiativePulse', 'localPlayerView.turnBannerAtLists', 'localPlayerView.turnDim',
      'localPlayerView.initiativeMaxCards', 'localPlayerView.playersDraw', 'localPlayerView.playersOpenDoors', 'localPlayerView.sharedVision',
      'sound', 'fogEdge', 'dragDistance',
    ]);
  });

  it("a newer Atlas's file keeps its unknown keys and fields, but for the toolbar's", async () => {
    const file = fixture('data-newer.json');
    const saved = await savedAfterOneChange(file);
    expect(changedPaths(file, saved)).toEqual(['diceVolume', 'toolbar.pinned']);
  });
});

/** Local storage of a device as 0.21.2 leaves it, and the same with what a newer Atlas might add. */
const DEVICE_0_21_2: Record<string, string> = {
  'atlas-vtt:input-mode': 'trackpad',
  'atlas-vtt:graphics': '{"preset":"balanced","overrides":{"bounces":false}}',
  'atlas-vtt:lighting-quality': 'balanced',
  'atlas-vtt:lighting-quality-picked': 'high',
  'atlas-vtt:animate-maps': 'off',
  'atlas-vtt:selection-bar': 'shown',
  'atlas-vtt:gm-fog-opacity': '0.7',
  'atlas-vtt:table-tv': '{"trueScale":true,"cellMm":25,"screens":{"3840x2160":{"rotation":90,"pxPerMm":4.2}}}',
  'atlas-vtt:draw-tool': '{"color":"#123456","size":"l"}',
  'atlas-vtt:pen-seen': 'seen',
  'atlas-vtt:finger-use': 'pan',
  'atlas-vtt:zoom-buttons': 'shown',
};
const DEVICE_NEWER: Record<string, string> = {
  ...DEVICE_0_21_2,
  'atlas-vtt:input-mode': 'gamepad',
  'atlas-vtt:graphics': '{"preset":"cinematic","overrides":{"rays":4}}',
  'atlas-vtt:table-tv': '{"trueScale":true,"cellMm":25,"screens":{},"tilt":3}',
  'atlas-vtt:weather-quality': 'low',
};

describe("the device's local storage from other versions, read and written back with one preference changed", () => {
  it.each([['0.21.2', DEVICE_0_21_2], ['a newer Atlas', DEVICE_NEWER]])('as %s leaves it, every other key stays as it was', async (_version, device) => {
    const app = new App();
    for (const [key, stored] of Object.entries(device)) app.saveLocalStorage(key, stored);
    const settings = new SettingsService(app, undefined, memoryPluginData(null));
    await settings.initialize();
    settings.getGraphics();
    settings.getTableTvDevice();
    settings.setPlayerView4k(true);
    await settings.saveSettingsNow();
    const after = Object.fromEntries([...Object.keys(device), 'atlas-vtt:player-view-4k'].map((key) => [key, app.loadLocalStorage(key)]));
    expect(after).toEqual({ ...device, 'atlas-vtt:player-view-4k': '4k' });
  });
});
