import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { renderMenu, type MenuActions } from '../../src/app/online/gm/dock/ConnectionMenu';
import { panelView, renderPanel, type PanelActions } from '../../src/app/online/gm/dock/OnlinePanel';
import { menuModel, type OnlineSnapshot } from '../../src/app/online/gm/dock/panelModel';
import { DASHBOARD_THEME as THEME } from './dashboardTheme';

vi.mock('events', async () => import('eventemitter3'));

/** The header of a running table's menu and panel, laid out by the plugin's stylesheet; screenshots go to `__screenshots__`. */

const SCENE = { isShared: true, tokens: {}, selected: [] };
const GATE = { code: '123456', requireCode: true, askToJoin: false, paused: false, pausedAt: null, waiting: [] };
const SNAPSHOT = { status: 'online', link: 'https://play.atlas-vtt.dev/#code', campaignId: null, sharedLeaf: null, sharedName: null, sharedTokens: {}, players: [], playerTokens: [], seats: null, gate: GATE, rests: [], cardOrder: [] } as unknown as OnlineSnapshot;
const FEEDBACK = { open: false, diagnostics: false, state: 'idle', errorReports: false } as const;
const actions = (): MenuActions & PanelActions => new Proxy({}, { get: () => vi.fn() }) as MenuActions & PanelActions;

function surface(): HTMLElement {
  document.body.className = 'theme-dark';
  const plugin = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  plugin.style.cssText = 'position: absolute; inset: 0; padding: 40px; background: var(--background-primary);';
  const dock = plugin.createDiv({ cls: 'atlas-online-dock' });
  dock.style.cssText = 'position: relative; width: 300px; border: none; box-shadow: none; background: none;';
  const box = dock.createDiv({ cls: 'atlas-online-surface' });
  box.style.cssText = 'position: static; width: 300px;';
  return box;
}

const buttons = (box: HTMLElement): HTMLElement[] => [...box.querySelectorAll<HTMLElement>('.atlas-online-header button')];

/** Left to right, one row, none overlapping its neighbour. */
function inOneRow(box: HTMLElement): void {
  const rects = buttons(box).map((button) => button.getBoundingClientRect());
  for (let i = 1; i < rects.length; i++) {
    expect(rects[i]!.left).toBeGreaterThanOrEqual(rects[i - 1]!.right);
    expect(rects[i]!.top + rects[i]!.height / 2).toBeCloseTo(rects[0]!.top + rects[0]!.height / 2, 0);
  }
}

describe('a running table\'s header', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => {
    style.remove();
    document.body.empty();
  });

  it('has "…" then Stop in the menu', async () => {
    const box = surface();
    renderMenu(box.createDiv({ cls: 'atlas-online-layer', attr: { id: 'menu' } }), menuModel({ ...SNAPSHOT, players: [] }, SCENE, { kind: 'signed-out' }), actions());
    expect(buttons(box).map((button) => button.getAttribute('aria-label'))).toEqual(['More', 'Stop table']);
    inOneRow(box);
    await page.screenshot({ path: '__screenshots__/atlas-online-header-menu.png', element: box });
  });

  it('has "…", Stop and Close in the panel', async () => {
    const box = surface();
    const view = panelView({ ...SNAPSHOT, players: [{ id: 'a'.repeat(20), name: 'Ana', online: true }] }, SCENE, FEEDBACK);
    renderPanel(box.createDiv({ cls: 'atlas-online-layer', attr: { id: 'panel' } }), view, actions());
    expect(buttons(box).map((button) => button.getAttribute('aria-label'))).toEqual(['More', 'Stop table', 'Close']);
    inOneRow(box);
    await page.screenshot({ path: '__screenshots__/atlas-online-header-panel.png', element: box });
  });

  it('asks before stopping in the Add player row\'s place, so the panel keeps its height', async () => {
    const box = surface();
    const view = panelView({ ...SNAPSHOT, players: [{ id: 'a'.repeat(20), name: 'Ana', online: true }] }, SCENE, FEEDBACK);
    renderPanel(box.createDiv({ cls: 'atlas-online-layer', attr: { id: 'panel' } }), view, actions());
    const height = box.getBoundingClientRect().height;
    box.querySelector<HTMLButtonElement>('.atlas-online-header__stop')!.click();
    expect(box.querySelector('.atlas-online-confirm')).not.toBeNull();
    expect(box.getBoundingClientRect().height).toBe(height);
    await page.screenshot({ path: '__screenshots__/atlas-online-stop-confirm.png', element: box });
  });
});
