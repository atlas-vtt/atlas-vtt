import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { cdp, page } from 'vitest/browser';
import type { App, TFile } from 'obsidian';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';
import { Dashboard } from '../../src/app/react/components/dashboard/Dashboard';
import { AssetService } from '../../src/app/services/AssetService';
import { mapThumbnailPath } from '../../src/app/utils/dataFileMigration';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';

/**
 * The dashboard laid out in a real browser for the dashboard's GPU tests: a vault of scenes whose
 * maps are painted pictures, the campaigns in memory, and helpers to look at it.
 */

export const CAVES = 'atlas-vtt/collections/Cairn/scenes/Blue Mouth Caves.atlasmap';
export const HOLLOW_OAK = 'atlas-vtt/collections/Cairn/scenes/Hollow Oak.atlasmap';
export const MILL = 'atlas-vtt/collections/Cairn/scenes/The Old Mill.atlasmap';
export const CAVES_MAP = 'atlas-vtt/assets/Blue Mouth Caves.webp';
export const WORLD_MAP = 'atlas-vtt/assets/The Wide World.webp';
export const DAY = 24 * 60 * 60 * 1000;

/** A painted map: sea, lands, a river and a faint grid, in the hue given, `width` × `height`. */
export function paintedMap(hue: number, width = 640, height = 400): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const sea = context.createLinearGradient(0, 0, width, height);
  sea.addColorStop(0, `hsl(${hue}, 32%, 46%)`);
  sea.addColorStop(1, `hsl(${hue + 25}, 38%, 28%)`);
  context.fillStyle = sea;
  context.fillRect(0, 0, width, height);
  const lands: [number, number, number, number, number][] = [[0.34, 0.42, 0.3, 0.3, -0.3], [0.74, 0.7, 0.18, 0.2, 0.4], [0.8, 0.22, 0.12, 0.1, 0.2]];
  for (const [x, y, rx, ry, turn] of lands) {
    context.fillStyle = `hsl(${hue + 70}, 28%, 56%)`;
    context.beginPath();
    context.ellipse(x * width, y * height, rx * width, ry * height, turn, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = `hsl(${hue + 90}, 24%, 44%)`;
    context.beginPath();
    context.ellipse(x * width, y * height, rx * width * 0.45, ry * height * 0.4, turn, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = `hsl(${hue}, 45%, 38%)`;
  context.lineWidth = Math.max(3, width / 120);
  context.beginPath();
  context.moveTo(width * 0.2, height * 0.2);
  context.quadraticCurveTo(width * 0.38, height * 0.5, width * 0.52, height * 0.78);
  context.stroke();
  context.strokeStyle = 'rgb(0 0 0 / 10%)';
  context.lineWidth = 1;
  for (let x = 0; x < width; x += width / 16) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += width / 16) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  return canvas.toDataURL();
}

const sceneFile = (path: string, background?: string, tokens: Record<string, unknown> = {}): string => JSON.stringify({
  version: 4,
  state: { schema: 'atlas-vtt', version: 4, mapPath: path, ...(background && { background }), objects: { tokens } },
});

export interface Mounted {
  app: App;
  storage: ReturnType<typeof memoryCampaigns>;
  sceneIds: Map<string, string>;
  mapIds: Map<string, string>;
}

export interface MountOptions {
  /** Scenes in the vault; none makes an empty vault. */
  scenes?: boolean;
  /** Player characters standing on the caves. */
  party?: { name: string; art: string; picture: string; ring: boolean }[];
  /** The campaigns are still being read. */
  campaignsLoading?: boolean;
  /** The pane's size. */
  size?: { width: number; height: number };
  /** Runs once the vault is set up, just before the dashboard is rendered. */
  beforeRender?: () => void;
  /** Pictures by vault path, in place of the painted ones. */
  pictures?: Record<string, string>;
}

/** Mounts the dashboard in the theme; `campaigns` gets the ids of scenes and maps by name. */
export async function mountDashboard(
  theme: 'light' | 'dark',
  campaigns: (ids: { scenes: Map<string, string>; maps: Map<string, string> }) => StoredCampaign[] = () => [],
  { scenes = true, party = [], campaignsLoading = false, size = { width: 1280, height: 860 }, beforeRender, pictures: given = {} }: MountOptions = {},
): Promise<Mounted> {
  document.body.className = `theme-${theme}`;
  await page.viewport(size.width, size.height);
  const tokens = Object.fromEntries(party.map((member, index) => [`t${index}`, { imagePath: member.art, ...(index === 0 && { ringColor: '#c0392b' }) }]));
  const { app } = createInMemoryApp({
    files: {
      ...(scenes && {
        [CAVES]: sceneFile(CAVES, CAVES_MAP, tokens),
        [HOLLOW_OAK]: sceneFile(HOLLOW_OAK),
        [MILL]: sceneFile(MILL),
        [mapThumbnailPath(CAVES)]: 'JPG',
        [mapThumbnailPath(HOLLOW_OAK)]: 'JPG',
        [mapThumbnailPath(MILL)]: 'JPG',
      }),
      [CAVES_MAP]: 'WEBP',
      [WORLD_MAP]: 'WEBP',
      ...Object.fromEntries(party.map((member) => [member.art, 'WEBP'])),
    },
  });
  const pictures = new Map<string, string>([
    [mapThumbnailPath(CAVES), paintedMap(200, 160, 120)],
    [mapThumbnailPath(HOLLOW_OAK), paintedMap(110, 160, 120)],
    [mapThumbnailPath(MILL), paintedMap(30, 160, 120)],
    [CAVES_MAP, paintedMap(200, 1200, 800)],
    [WORLD_MAP, paintedMap(170, 1600, 1000)],
    ...party.map((member) => [member.art, member.picture] as const),
    ...Object.entries(given),
  ]);
  vi.mocked(app.vault.getResourcePath).mockImplementation((file: TFile) => pictures.get(file.path) ?? '');
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  await assets.addAsset({ type: 'map', name: 'The Wide World', mapFilePath: WORLD_MAP, tags: [], collection: 'Cairn' });
  if (party.length > 0) {
    await assets.addAssets(party.map((member) => ({
      type: 'token' as const, name: member.name, imagePath: member.art, tags: [], collection: 'Cairn', playerCharacter: true as const, showRing: member.ring,
    })));
  }
  const [sceneAssets, mapAssets] = await Promise.all([assets.getAssets(undefined, 'scene'), assets.getAssets(undefined, 'map')]);
  const sceneIds = new Map(sceneAssets.map((scene) => [scene.name, scene.id]));
  const mapIds = new Map(mapAssets.map((map) => [map.name, map.id]));
  const storage = memoryCampaigns(campaigns({ scenes: sceneIds, maps: mapIds }));
  if (campaignsLoading) storage.isLoaded = () => false;
  beforeRender?.();
  render(
    React.createElement('div', { className: 'workspace-leaf-content atlas-dashboard-view atlas-vtt-plugin', style: { width: `${size.width}px`, height: `${size.height}px` } },
      React.createElement(Dashboard, { app, campaignStorage: storage, onOpenScene: vi.fn(), onCreateMap: vi.fn(), onOpenAssetManager: vi.fn() })),
  );
  return { app, storage, sceneIds, mapIds };
}

export const query = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
export const queryAll = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)];
export const buttonNamed = (name: string): HTMLButtonElement => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === name)!;
export const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Saves a screenshot of the dashboard's view beside the test, in `__screenshots__`. */
export const shot = (name: string, element: HTMLElement = query('.atlas-dashboard-view')): Promise<string> =>
  page.screenshot({ path: `__screenshots__/atlas-dashboard-${name}.png`, element });

/** Holds `element` in a pseudo-class (`hover`, `active`, `focus-visible`) through the browser's devtools, until `release`. */
export async function forceState(element: HTMLElement, states: string[]): Promise<() => Promise<void>> {
  const marker = `probe-${Math.random().toString(36).slice(2)}`;
  element.setAttribute('data-probe', marker);
  const session = cdp();
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  await session.send('DOM.getDocument', { depth: -1, pierce: true });
  const search = await session.send('DOM.performSearch', { query: `[data-probe="${marker}"]`, includeUserAgentShadowDOM: false });
  const { nodeIds } = await session.send('DOM.getSearchResults', { searchId: search.searchId, fromIndex: 0, toIndex: search.resultCount });
  const nodeId = nodeIds[0]!;
  await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states });
  return async () => {
    await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    element.removeAttribute('data-probe');
  };
}
