import '../setup/obsidianDom';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import playerWindowCss from '../../src/app/services/player-window.scss?inline';
import { renderTurnBanner } from '../../src/app/initiative/banner/turnBannerElement';
import type { TurnBanner } from '../../src/app/initiative/banner/turnBanner';

const SHOTS = '__screenshots__/init-turn';

/** Obsidian's theme as the banner meets it. */
const THEME = `
  body { margin: 0; font: 13px/1.5 sans-serif; background: #3a3f36; --background-primary: #1e1e1e; --text-normal: #dadada; --text-muted: #a0a0a0;
    --text-accent: #a68af9; --interactive-accent: #7f6df2; --mono-100: #fff; --mono-0: #000; --shadow-l: 0 8px 24px rgb(0 0 0 / 0.45);
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-interface: sans-serif; }
`;

function portrait(): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#7a3a3a"/><text x="48" y="62" font-size="44" text-anchor="middle" fill="#fff" font-family="sans-serif">G</text></svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const BANNER: TurnBanner = { key: 'k', round: 3, title: 'Goblin Archer of the Western Hills', portrait: { imagePath: 'goblin', showRing: true } };

/** The GM's map as `UIRoot` lays it out: scene tabs and the dice rolls in the top row, the toolbar row at the bottom with the banner above it. */
const GM_MAP = `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-top-bar-row">
        <div class="atlas-scene-tab-bar" style="width: 420px; height: 39px"></div>
        <div class="atlas-top-bar-end">
          <div class="atlas-dice-rolls atlas-vtt-plugin">
            <div class="atlas-dice-roll"><div class="atlas-dice-roll__sheet" style="height: 260px"></div></div>
            <div class="atlas-dice-roll"><div class="atlas-dice-roll__sheet" style="height: 120px"></div></div>
          </div>
        </div>
      </div>
      <div class="atlas-bottom-toolbar-row">
        <div class="atlas-bottom-toolbar-row__start"><div style="width: 80px; height: 44px"></div></div>
        <div class="atlas-vtt-toolbar atlas-main-toolbar" style="width: 420px; height: 52px"></div>
        <div class="atlas-bottom-toolbar-row__end"><div style="width: 44px; height: 44px"></div></div>
        <div class="atlas-bottom-toolbar-row__above" aria-live="polite"></div>
      </div>
    </div>
  </div>
`;

const box = (element: Element | null): DOMRect => element!.getBoundingClientRect();
const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('where the turn banner stands', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css + playerWindowCss;
  const leaf = document.createElement('div');

  afterEach(() => {
    leaf.remove();
    style.remove();
    document.body.classList.remove('atlas-player-window');
    document.body.querySelectorAll('.atlas-player-turn-banner, .atlas-player-dice-rolls').forEach((element) => element.remove());
  });

  it('on the GM\'s map: centred above the toolbar, clear of the scene tabs, the toolbar and the dice rolls, at any width', async () => {
    for (const width of [1200, 720]) {
      await page.viewport(width + 40, 800);
      document.head.append(style);
      leaf.style.cssText = `position: relative; width: ${width}px; height: 720px; contain: strict`;
      leaf.innerHTML = GM_MAP;
      document.body.append(leaf);
      const banner = renderTurnBanner(leaf.querySelector<HTMLElement>('.atlas-bottom-toolbar-row__above')!, BANNER, portrait);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const at = box(banner);
      expect(Math.abs((at.left + at.right) / 2 - (box(leaf).left + width / 2))).toBeLessThan(1);
      for (const other of ['.atlas-dice-rolls', '.atlas-scene-tab-bar', '.atlas-main-toolbar']) expect(overlaps(at, box(leaf.querySelector(other))), other).toBe(false);
      expect(box(leaf.querySelector('.atlas-main-toolbar')).top - at.bottom).toBeCloseTo(8, 0);

      // A capsule: padding and gap of 8 px, its round end concentric with the portrait
      const computed = getComputedStyle(banner);
      expect(computed.paddingTop).toBe('8px');
      expect(computed.columnGap).toBe('8px');
      const art = box(banner.querySelector('.atlas-turn-banner__portrait'));
      expect(art.width).toBe(40);
      // Chromium draws the 1.5 px border a whole pixel wide: read what it drew
      const border = parseFloat(computed.borderLeftWidth);
      expect(art.left - at.left).toBeCloseTo(8 + border, 1);
      expect(at.height / 2).toBeCloseTo(20 + 8 + border, 1);
      // A long name ends in an ellipsis inside the capsule
      expect(box(banner.querySelector('.atlas-turn-banner__title')).right).toBeLessThanOrEqual(at.right - 8);
      await page.screenshot({ path: `${SHOTS}/banner-gm-${width}.png`, element: leaf });
      leaf.remove();
    }
  });

  it('in the player window: at the bottom centre, clear of the dice rolls at the top and the initiative list at the side', async () => {
    await page.viewport(1280, 720);
    document.head.append(style);
    document.body.classList.add('atlas-player-window');
    const dice = document.body.createDiv({ cls: 'atlas-player-dice-rolls' }).createDiv({ cls: 'atlas-dice-rolls atlas-vtt-plugin' });
    dice.createDiv({ cls: 'atlas-dice-roll' }).createDiv({ cls: 'atlas-dice-roll__sheet' }).style.height = '260px';
    const host = document.body.createDiv({ cls: 'atlas-player-turn-banner' });
    const banner = renderTurnBanner(host, { ...BANNER, title: null, round: null }, portrait);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const at = box(banner);
    expect(overlaps(at, box(dice))).toBe(false);
    expect(Math.abs((at.left + at.right) / 2 - 640)).toBeLessThan(1);
    expect(720 - at.bottom).toBeCloseTo(16, 0);
    // The players' list stands in the middle of the side and stops 160 px above the bottom
    expect(720 - at.top).toBeLessThan(160);
    await page.screenshot({ path: `${SHOTS}/banner-player.png` });
  });
});
